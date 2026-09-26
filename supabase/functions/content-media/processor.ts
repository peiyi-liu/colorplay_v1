import {
  ErrorMetric,
  ImageMagick,
  MagickFormat,
  initializeImageMagick,
} from 'npm:@imagemagick/magick-wasm@0.0.43';

export const CONTENT_MEDIA_PROCESSOR_VERSION =
  '@imagemagick/magick-wasm@0.0.43;pipeline=1';
export const CONTENT_MEDIA_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const CONTENT_MEDIA_MAX_DIMENSION = 4096;

export type ContentMediaSourceMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ContentMediaSemanticRole = 'standard' | 'color_critical';
export type ContentMediaVariantKind =
  'thumbnail' | 'reading' | 'color_critical';

export interface ProcessedContentMediaVariant {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly kind: ContentMediaVariantKind;
  readonly mimeType: 'image/webp';
  readonly qualityMode: 'lossy' | 'lossless' | 'high_quality';
  readonly sha256: string;
  readonly structuralSimilarityDistortion: number | null;
  readonly width: number;
}

export interface ProcessedContentMedia {
  readonly hasAlpha: boolean;
  readonly height: number;
  readonly manifestSha256: string;
  readonly pixelSemanticSha256: string;
  readonly processorVersion: string;
  readonly semanticRole: ContentMediaSemanticRole;
  readonly sourceBytes: number;
  readonly sourceMimeType: ContentMediaSourceMime;
  readonly sourceSha256: string;
  readonly variants: readonly ProcessedContentMediaVariant[];
  readonly width: number;
}

export class ContentMediaProcessorError extends Error {
  readonly code: 'CONTENT_MEDIA_FILE_INVALID' | 'CONTENT_MEDIA_QUALITY_FAILED';

  constructor(code: ContentMediaProcessorError['code']) {
    super(code);
    this.name = 'ContentMediaProcessorError';
    this.code = code;
  }
}

let initialization: Promise<void> | null = null;

export const initializeContentMediaProcessor = (): Promise<void> => {
  initialization ??= (async () => {
    const wasmUrl = new URL(
      './x86/magick.wasm',
      import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.43'),
    );
    await initializeImageMagick(await Deno.readFile(wasmUrl));
  })();
  return initialization;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digestInput = Uint8Array.from(bytes);
  return toHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput.buffer)),
  );
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
};

const startsWith = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  expected.every((byte, index) => bytes[index] === byte);

export const detectContentMediaMime = (
  bytes: Uint8Array,
): ContentMediaSourceMime | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
};

const resizedDimensions = (
  width: number,
  height: number,
  longEdge: number,
): Readonly<{ width: number; height: number }> => {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
};

type EncodedVariant = Readonly<{
  bytes: Uint8Array;
  height: number;
  qualityMode: ProcessedContentMediaVariant['qualityMode'];
  structuralSimilarityDistortion: number | null;
  width: number;
}>;

const writeWebp = (
  source: Uint8Array,
  longEdge: number,
  quality: number,
  lossless: boolean,
): EncodedVariant =>
  ImageMagick.read(source, (image) => {
    image.autoOrient();
    const dimensions = resizedDimensions(image.width, image.height, longEdge);
    if (
      image.width !== dimensions.width ||
      image.height !== dimensions.height
    ) {
      image.resize(dimensions.width, dimensions.height);
    }
    image.strip();
    image.quality = quality;
    image.settings.setDefine(MagickFormat.WebP, 'lossless', lossless);
    image.settings.setDefine(MagickFormat.WebP, 'method', 6);
    image.settings.setDefine(MagickFormat.WebP, 'exact', true);
    image.settings.setDefine(MagickFormat.WebP, 'use-sharp-yuv', true);
    const bytes = image.write(MagickFormat.WebP, (data) =>
      Uint8Array.from(data),
    );
    return {
      bytes,
      height: image.height,
      qualityMode: lossless
        ? 'lossless'
        : quality >= 92
          ? 'high_quality'
          : 'lossy',
      structuralSimilarityDistortion: null,
      width: image.width,
    };
  });

const withDistortion = (
  source: Uint8Array,
  encoded: EncodedVariant,
): EncodedVariant => {
  const distortion = ImageMagick.read(source, (sourceImage) => {
    sourceImage.autoOrient();
    if (
      sourceImage.width !== encoded.width ||
      sourceImage.height !== encoded.height
    ) {
      sourceImage.resize(encoded.width, encoded.height);
    }
    return ImageMagick.read(encoded.bytes, (outputImage) =>
      sourceImage.compare(outputImage, ErrorMetric.StructuralSimilarity),
    );
  });
  return { ...encoded, structuralSimilarityDistortion: distortion };
};

const encodeWithinBudget = (
  source: Uint8Array,
  longEdge: number,
  maxBytes: number,
): EncodedVariant => {
  for (const quality of [82, 76, 70, 64, 58]) {
    const encoded = writeWebp(source, longEdge, quality, false);
    if (encoded.bytes.byteLength <= maxBytes) return encoded;
  }
  throw new ContentMediaProcessorError('CONTENT_MEDIA_QUALITY_FAILED');
};

const encodeColorCritical = (
  source: Uint8Array,
  maxBytes: number,
): EncodedVariant => {
  const lossless = withDistortion(source, writeWebp(source, 1200, 100, true));
  if (lossless.bytes.byteLength <= maxBytes) return lossless;
  for (const quality of [98, 96, 94, 92]) {
    const encoded = withDistortion(
      source,
      writeWebp(source, 1200, quality, false),
    );
    if (
      encoded.bytes.byteLength <= maxBytes &&
      encoded.structuralSimilarityDistortion !== null &&
      encoded.structuralSimilarityDistortion <= 0.01
    ) {
      return encoded;
    }
  }
  throw new ContentMediaProcessorError('CONTENT_MEDIA_QUALITY_FAILED');
};

const toManifestVariant = (variant: ProcessedContentMediaVariant) => ({
  bytes: variant.bytes.byteLength,
  height: variant.height,
  kind: variant.kind,
  mime_type: variant.mimeType,
  quality_mode: variant.qualityMode,
  sha256: variant.sha256,
  structural_similarity_distortion: variant.structuralSimilarityDistortion,
  width: variant.width,
});

export async function processContentMedia(
  input: Readonly<{
    bytes: Uint8Array;
    declaredMimeType: string;
    semanticRole: ContentMediaSemanticRole;
  }>,
): Promise<ProcessedContentMedia> {
  if (
    input.bytes.byteLength <= 0 ||
    input.bytes.byteLength > CONTENT_MEDIA_MAX_SOURCE_BYTES
  ) {
    throw new ContentMediaProcessorError('CONTENT_MEDIA_FILE_INVALID');
  }
  const detectedMimeType = detectContentMediaMime(input.bytes);
  if (
    detectedMimeType === null ||
    detectedMimeType !== input.declaredMimeType
  ) {
    throw new ContentMediaProcessorError('CONTENT_MEDIA_FILE_INVALID');
  }
  await initializeContentMediaProcessor();

  let source: Readonly<{
    hasAlpha: boolean;
    height: number;
    pixelSemanticSha256: string;
    width: number;
  }>;
  try {
    source = ImageMagick.read(input.bytes, (image) => {
      image.autoOrient();
      if (
        image.width <= 0 ||
        image.height <= 0 ||
        image.width > CONTENT_MEDIA_MAX_DIMENSION ||
        image.height > CONTENT_MEDIA_MAX_DIMENSION
      ) {
        throw new ContentMediaProcessorError('CONTENT_MEDIA_FILE_INVALID');
      }
      const signature = image.signature;
      if (signature === null || !/^[0-9a-f]{64}$/u.test(signature)) {
        throw new ContentMediaProcessorError('CONTENT_MEDIA_FILE_INVALID');
      }
      return {
        hasAlpha: image.hasAlpha,
        height: image.height,
        pixelSemanticSha256: signature,
        width: image.width,
      };
    });
  } catch (error) {
    if (error instanceof ContentMediaProcessorError) throw error;
    throw new ContentMediaProcessorError('CONTENT_MEDIA_FILE_INVALID');
  }

  const encoded: Array<{
    kind: ContentMediaVariantKind;
    value: EncodedVariant;
  }> = [
    {
      kind: 'thumbnail' as const,
      value: encodeWithinBudget(input.bytes, 320, 40 * 1024),
    },
    {
      kind: 'reading' as const,
      value: encodeWithinBudget(input.bytes, 800, 120 * 1024),
    },
  ];
  if (input.semanticRole === 'color_critical') {
    encoded.push({
      kind: 'color_critical',
      value: encodeColorCritical(input.bytes, 250 * 1024),
    });
  }

  const variants = await Promise.all(
    encoded.map(async ({ kind, value }) => ({
      bytes: value.bytes,
      height: value.height,
      kind,
      mimeType: 'image/webp' as const,
      qualityMode: value.qualityMode,
      sha256: await sha256Hex(value.bytes),
      structuralSimilarityDistortion: value.structuralSimilarityDistortion,
      width: value.width,
    })),
  );
  const sourceSha256 = await sha256Hex(input.bytes);
  const manifest = {
    has_alpha: source.hasAlpha,
    height: source.height,
    pixel_semantic_sha256: source.pixelSemanticSha256,
    processor_version: CONTENT_MEDIA_PROCESSOR_VERSION,
    semantic_role: input.semanticRole,
    source_bytes: input.bytes.byteLength,
    source_mime_type: detectedMimeType,
    source_sha256: sourceSha256,
    variants: variants.map(toManifestVariant),
    width: source.width,
  };
  const manifestSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalJson(manifest)),
  );

  return {
    hasAlpha: source.hasAlpha,
    height: source.height,
    manifestSha256,
    pixelSemanticSha256: source.pixelSemanticSha256,
    processorVersion: CONTENT_MEDIA_PROCESSOR_VERSION,
    semanticRole: input.semanticRole,
    sourceBytes: input.bytes.byteLength,
    sourceMimeType: detectedMimeType,
    sourceSha256,
    variants,
    width: source.width,
  };
}
