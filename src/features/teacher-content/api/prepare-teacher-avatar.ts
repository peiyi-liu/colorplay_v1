export const TEACHER_AVATAR_OUTPUT_MAX_BYTES = 256 * 1024;

type AvatarEncodeOptions = Readonly<{
  height: number;
  quality: number;
  width: number;
}>;

export type DecodedAvatarImage = Readonly<{
  close: () => void;
  encodeWebp: (options: AvatarEncodeOptions) => Promise<Blob>;
  height: number;
  width: number;
}>;

type DecodeAvatarImage = (file: File) => Promise<DecodedAvatarImage>;

type AvatarImagePreparationErrorCode = 'INVALID_IMAGE' | 'OUTPUT_TOO_LARGE';

export class AvatarImagePreparationError extends Error {
  constructor(public readonly code: AvatarImagePreparationErrorCode) {
    super(code);
    this.name = 'AvatarImagePreparationError';
  }
}

const candidates = [
  { maxEdge: 512, quality: 0.82 },
  { maxEdge: 512, quality: 0.72 },
  { maxEdge: 384, quality: 0.72 },
  { maxEdge: 256, quality: 0.62 },
] as const;

const fitWithin = (
  width: number,
  height: number,
  maxEdge: number,
): Readonly<{ height: number; width: number }> => {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
};

const decodeInBrowser: DecodeAvatarImage = async (file) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new AvatarImagePreparationError('INVALID_IMAGE');
  }

  return {
    close: () => {
      image.src = '';
      URL.revokeObjectURL(objectUrl);
    },
    encodeWebp: ({ height, quality, width }) =>
      new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) {
          reject(new AvatarImagePreparationError('INVALID_IMAGE'));
          return;
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob?.type !== 'image/webp') {
              reject(new AvatarImagePreparationError('INVALID_IMAGE'));
              return;
            }
            resolve(blob);
          },
          'image/webp',
          quality,
        );
      }),
    height: image.naturalHeight,
    width: image.naturalWidth,
  };
};

export const createTeacherAvatarPreparer =
  (decodeAvatarImage: DecodeAvatarImage = decodeInBrowser) =>
  async (file: File): Promise<File> => {
    let image: DecodedAvatarImage;
    try {
      image = await decodeAvatarImage(file);
    } catch (error) {
      if (error instanceof AvatarImagePreparationError) throw error;
      throw new AvatarImagePreparationError('INVALID_IMAGE');
    }

    try {
      for (const candidate of candidates) {
        const dimensions = fitWithin(
          image.width,
          image.height,
          candidate.maxEdge,
        );
        const blob = await image.encodeWebp({
          ...dimensions,
          quality: candidate.quality,
        });
        if (blob.size <= TEACHER_AVATAR_OUTPUT_MAX_BYTES) {
          return new File([blob], 'teacher-avatar.webp', {
            lastModified: Date.now(),
            type: 'image/webp',
          });
        }
      }
    } finally {
      image.close();
    }

    throw new AvatarImagePreparationError('OUTPUT_TOO_LARGE');
  };

export const prepareTeacherAvatar = createTeacherAvatarPreparer();
