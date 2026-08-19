import { expect, test } from '@playwright/test';

test('teacher avatar preparation emits a bounded WebP in Chromium', async ({
  page,
}) => {
  await page.goto('/dev-harness/teacher-routes.html?scenario=analytics');

  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 800;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    const gradient = context.createLinearGradient(0, 0, 1600, 800);
    gradient.addColorStop(0, '#061321');
    gradient.addColorStop(0.5, '#da2778');
    gradient.addColorStop(1, '#9ad5ff');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1600, 800);

    const source = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed'));
      }, 'image/png');
    });
    const modulePath =
      '/src/features/teacher-content/api/prepare-teacher-avatar.ts';
    const module = (await import(/* @vite-ignore */ modulePath)) as {
      prepareTeacherAvatar: (file: File) => Promise<File>;
    };
    const output = await module.prepareTeacherAvatar(
      new File([source], 'teacher-source.png', { type: 'image/png' }),
    );
    const decoded = await createImageBitmap(output);
    const inspected = {
      height: decoded.height,
      name: output.name,
      size: output.size,
      type: output.type,
      width: decoded.width,
    };
    decoded.close();
    return inspected;
  });

  expect(result).toEqual({
    height: 256,
    name: 'teacher-avatar.webp',
    size: expect.any(Number),
    type: 'image/webp',
    width: 512,
  });
  expect(result.size).toBeLessThanOrEqual(256 * 1024);
});
