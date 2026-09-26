import {
  Drawables,
  ImageMagick,
  MagickColor,
  MagickFormat,
} from 'npm:@imagemagick/magick-wasm@0.0.43';

import {
  ContentMediaProcessorError,
  initializeContentMediaProcessor,
  processContentMedia,
} from './processor.ts';

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const injectExifOrientation = (
  jpeg: Uint8Array,
  orientation: number,
): Uint8Array => {
  const exif = new Uint8Array([
    0xff,
    0xe1,
    0x00,
    0x22,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x12,
    0x01,
    0x03,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const result = new Uint8Array(jpeg.byteLength + exif.byteLength);
  result.set(jpeg.slice(0, 2), 0);
  result.set(exif, 2);
  result.set(jpeg.slice(2), 2 + exif.byteLength);
  return result;
};

const makeFixture = (
  format: (typeof MagickFormat)[keyof typeof MagickFormat],
  options: Readonly<{ alpha?: boolean; exifOrientation?: number }> = {},
): Uint8Array => {
  const background = new MagickColor(options.alpha ? '#00000000' : '#ffffff');
  const bytes = ImageMagick.read(background, 1200, 800, (image) => {
    const drawing = new Drawables();
    const stripes = options.alpha ? 12 : 24;
    for (let index = 0; index < stripes; index += 1) {
      drawing
        .fillColor(new MagickColor(`hsl(${index * 15},100%,50%)`))
        .rectangle(index * 50, 0, index * 50 + 49, 799);
    }
    drawing.draw(image);
    image.quality = 92;
    return image.write(format, (data) => Uint8Array.from(data));
  });
  return options.exifOrientation
    ? injectExifOrientation(bytes, options.exifOrientation)
    : bytes;
};

await initializeContentMediaProcessor();

Deno.test(
  'decodes JPG, PNG and WebP and emits bounded deterministic WebP variants',
  async () => {
    const fixtures = [
      ['image/jpeg', makeFixture(MagickFormat.Jpeg)],
      ['image/png', makeFixture(MagickFormat.Png, { alpha: true })],
      ['image/webp', makeFixture(MagickFormat.WebP)],
    ] as const;

    for (const [declaredMimeType, bytes] of fixtures) {
      const first = await processContentMedia({
        bytes,
        declaredMimeType,
        semanticRole: 'standard',
      });
      const second = await processContentMedia({
        bytes,
        declaredMimeType,
        semanticRole: 'standard',
      });
      assertEquals(
        first.manifestSha256,
        second.manifestSha256,
        'manifest hash',
      );
      assertEquals(
        first.variants.map((variant) => [
          variant.kind,
          variant.width,
          variant.height,
          variant.sha256,
        ]),
        second.variants.map((variant) => [
          variant.kind,
          variant.width,
          variant.height,
          variant.sha256,
        ]),
        'variant manifest',
      );
      assertEquals(
        first.variants.map((variant) => [variant.kind, variant.width]),
        [
          ['thumbnail', 320],
          ['reading', 800],
        ],
        'responsive widths',
      );
      for (const variant of first.variants) {
        assertEquals(
          String.fromCharCode(...variant.bytes.slice(8, 12)),
          'WEBP',
          'WebP magic',
        );
      }
    }
  },
);

Deno.test('applies EXIF orientation and preserves alpha', async () => {
  const oriented = await processContentMedia({
    bytes: makeFixture(MagickFormat.Jpeg, { exifOrientation: 6 }),
    declaredMimeType: 'image/jpeg',
    semanticRole: 'standard',
  });
  assertEquals([oriented.width, oriented.height], [800, 1200], 'orientation');
  assertEquals(
    [oriented.variants[1]?.width, oriented.variants[1]?.height],
    [533, 800],
    'oriented reading dimensions',
  );

  const transparent = await processContentMedia({
    bytes: makeFixture(MagickFormat.Png, { alpha: true }),
    declaredMimeType: 'image/png',
    semanticRole: 'standard',
  });
  assert(transparent.hasAlpha, 'source alpha should be preserved');
  const alphaPreserved = ImageMagick.read(
    transparent.variants[1]!.bytes,
    (image) => image.hasAlpha,
  );
  assert(alphaPreserved, 'WebP alpha should be preserved');
});

Deno.test(
  'keeps a color-critical swatch within visual and byte budgets',
  async () => {
    const result = await processContentMedia({
      bytes: makeFixture(MagickFormat.Png),
      declaredMimeType: 'image/png',
      semanticRole: 'color_critical',
    });
    const colorCritical = result.variants.find(
      (variant) => variant.kind === 'color_critical',
    );
    assert(colorCritical, 'color-critical variant is required');
    assert(colorCritical.bytes.byteLength <= 250 * 1024, '250 KiB budget');
    assert(
      colorCritical.structuralSimilarityDistortion !== null &&
        colorCritical.structuralSimilarityDistortion <= 0.01,
      'SSIM distortion threshold',
    );
  },
);

Deno.test('rejects MIME mismatch, SVG and oversize input', async () => {
  for (const input of [
    {
      bytes: makeFixture(MagickFormat.Png),
      declaredMimeType: 'image/jpeg',
    },
    {
      bytes: new TextEncoder().encode('<svg><script>alert(1)</script></svg>'),
      declaredMimeType: 'image/svg+xml',
    },
    {
      bytes: new Uint8Array(2 * 1024 * 1024 + 1),
      declaredMimeType: 'image/png',
    },
  ]) {
    let error: unknown;
    try {
      await processContentMedia({ ...input, semanticRole: 'standard' });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ContentMediaProcessorError, 'expected rejection');
    assertEquals(error.code, 'CONTENT_MEDIA_FILE_INVALID', 'denial code');
  }
});
