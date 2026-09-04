import { describe, expect, it, vi } from 'vitest';

import {
  AvatarImagePreparationError,
  createTeacherAvatarPreparer,
  type DecodedAvatarImage,
} from './prepare-teacher-avatar';

const blobOfSize = (bytes: number) =>
  new Blob([new Uint8Array(bytes)], { type: 'image/webp' });

describe('teacher avatar preparation', () => {
  it('keeps aspect ratio and lowers quality until the WebP fits the upload budget', async () => {
    const encodeWebp = vi
      .fn<DecodedAvatarImage['encodeWebp']>()
      .mockResolvedValueOnce(blobOfSize(300_000))
      .mockResolvedValueOnce(blobOfSize(220_000));
    const close = vi.fn();
    const prepare = createTeacherAvatarPreparer(() =>
      Promise.resolve({
        close,
        encodeWebp,
        height: 800,
        width: 1600,
      }),
    );

    const result = await prepare(
      new File(['source'], 'portrait.png', { type: 'image/png' }),
    );

    expect(encodeWebp).toHaveBeenNthCalledWith(1, {
      height: 256,
      quality: 0.82,
      width: 512,
    });
    expect(encodeWebp).toHaveBeenNthCalledWith(2, {
      height: 256,
      quality: 0.72,
      width: 512,
    });
    expect(result).toMatchObject({
      name: 'teacher-avatar.webp',
      size: 220_000,
      type: 'image/webp',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails closed when no bounded candidate can meet the output budget', async () => {
    const prepare = createTeacherAvatarPreparer(() =>
      Promise.resolve({
        close: vi.fn(),
        encodeWebp: vi.fn().mockResolvedValue(blobOfSize(300_000)),
        height: 1200,
        width: 1200,
      }),
    );

    await expect(
      prepare(new File(['source'], 'noise.png', { type: 'image/png' })),
    ).rejects.toEqual(new AvatarImagePreparationError('OUTPUT_TOO_LARGE'));
  });
});
