import { describe, expect, it, vi } from 'vitest';

import { AvatarImagePreparationError } from './prepare-teacher-avatar';
import { createTeacherAvatarRepository } from './teacher-avatar-repository';

const USER_ID = '40000000-0000-4000-8000-000000000001';

function createClient({
  list = [{ name: 'avatar' }],
  uploadError = null,
}: Readonly<{
  list?: readonly { name: string }[];
  uploadError?: { message: string } | null;
}> = {}) {
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://example.test/avatar-signed' },
    error: null,
  });
  const upload = vi.fn().mockResolvedValue({ data: null, error: uploadError });
  const bucket = {
    createSignedUrl,
    list: vi.fn().mockResolvedValue({ data: list, error: null }),
    upload,
  };
  return {
    bucket,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID } },
        }),
      },
      storage: { from: vi.fn(() => bucket) },
    },
  };
}

describe('TeacherAvatarRepository', () => {
  it('returns null when the teacher has not uploaded an avatar', async () => {
    const { client } = createClient({ list: [] });

    const result = await createTeacherAvatarRepository(
      client as never,
    ).getAvatarUrl();

    expect(result).toBeNull();
  });

  it('uses the authenticated teacher fixed object path', async () => {
    const { bucket, client } = createClient();
    const file = new File(['avatar'], 'teacher.png', { type: 'image/png' });
    const optimized = new File(['optimized-avatar'], 'teacher-avatar.webp', {
      type: 'image/webp',
    });
    const prepareAvatar = vi.fn().mockResolvedValue(optimized);

    const result = await createTeacherAvatarRepository(
      client as never,
      prepareAvatar,
    ).uploadAvatar(file);

    expect(prepareAvatar).toHaveBeenCalledWith(file);
    expect(bucket.upload).toHaveBeenCalledWith(
      `${USER_ID}/avatar`,
      optimized,
      expect.objectContaining({ contentType: 'image/webp', upsert: true }),
    );
    expect(result).toBe('https://example.test/avatar-signed');
  });

  it.each([
    [new File(['avatar'], 'teacher.gif', { type: 'image/gif' }), 'AVATAR_TYPE'],
    [
      new File([new Uint8Array(2_097_153)], 'teacher.png', {
        type: 'image/png',
      }),
      'AVATAR_SIZE',
    ],
  ])('rejects an invalid image before upload', async (file, code) => {
    const { bucket, client } = createClient();

    await expect(
      createTeacherAvatarRepository(client as never).uploadAvatar(file),
    ).rejects.toMatchObject({ code });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it.each([
    [new AvatarImagePreparationError('INVALID_IMAGE'), 'AVATAR_TYPE'],
    [new AvatarImagePreparationError('OUTPUT_TOO_LARGE'), 'AVATAR_SIZE'],
    [new Error('canvas unavailable'), 'AVATAR_UNAVAILABLE'],
  ])('maps avatar preparation failures truthfully', async (failure, code) => {
    const { bucket, client } = createClient();
    const prepareAvatar = vi.fn().mockRejectedValue(failure);
    const file = new File(['avatar'], 'teacher.png', { type: 'image/png' });

    await expect(
      createTeacherAvatarRepository(
        client as never,
        prepareAvatar,
      ).uploadAvatar(file),
    ).rejects.toMatchObject({ code });
    expect(bucket.upload).not.toHaveBeenCalled();
  });
});
