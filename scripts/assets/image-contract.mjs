export const KIB = 1024;

const scene = (sourcePath, outputPath) => ({
  sourcePath,
  outputs: [
    {
      format: 'image/webp',
      maxBytes: 400 * KIB,
      outputPath,
      quality: 0.88,
    },
  ],
});

const reviewBook = (name) => ({
  sourcePath: `src/assets/chapter/review-books/${name}.png`,
  outputs: [
    {
      format: 'image/webp',
      maxBytes: 96 * KIB,
      maxWidth: 384,
      outputPath: `src/assets/chapter/review-books/${name}.webp`,
      quality: 0.88,
    },
  ],
});

const blook = (name) => ({
  sourcePath: `scripts/assets/source/blooks/${name}.png`,
  outputs: [
    {
      format: 'image/webp',
      maxBytes: 32 * KIB,
      maxWidth: 128,
      outputPath: `public/assets/blooks/${name}-128.webp`,
      quality: 0.88,
    },
    {
      format: 'image/webp',
      maxBytes: 64 * KIB,
      maxWidth: 256,
      outputPath: `public/assets/blooks/${name}-256.webp`,
      quality: 0.88,
    },
  ],
});

export const imageEncodes = [
  scene(
    'src/features/teacher-content/assets/teacher-analytics-observatory.png',
    'src/features/teacher-content/assets/teacher-analytics-observatory.webp',
  ),
  scene(
    'src/features/teacher-content/assets/teacher-workspace-command-room.png',
    'src/features/teacher-content/assets/teacher-workspace-command-room.webp',
  ),
  scene(
    'src/features/live/assets/live-projector-night-village.png',
    'src/features/live/assets/live-projector-night-village.webp',
  ),
  scene(
    'src/features/live/assets/live-explanation-scroll-pixel.png',
    'src/features/live/assets/live-explanation-scroll-pixel.webp',
  ),
  {
    sourcePath: 'scripts/assets/source/colorplay-grimoire-pixel-512.png',
    outputs: [
      {
        format: 'image/png',
        maxBytes: 64 * KIB,
        maxWidth: 128,
        outputPath: 'public/colorplay-grimoire-pixel.png',
      },
    ],
  },
  ...[
    'color-network',
    'color-pyramid',
    'color-swatches',
    'four-color-grid',
    'primary-colors',
    'prism-spectrum',
  ].map(reviewBook),
  ...[
    'little_fox',
    'lucky_cat',
    'travel_frog',
    'wise_owl',
    'primary_lion',
    'rainbow_horse',
    'panda_painter',
    'koala_toner',
    'tiger_orange',
    'octo_mixer',
    'robo_blue',
    'pixel_sprite',
    'indigo_dragon',
    'peacock_teal',
    'contrast_bee',
    'cmyk_toucan',
    'neon_axolotl',
    'chameleon_master',
    'gradient_whale',
    'grayscale_wolf',
  ].map(blook),
];

export const productionImageOutputs = imageEncodes.flatMap(
  ({ outputs }) => outputs,
);

export const reviewMediaContract = Object.freeze({
  format: 'image/webp',
  maxBytes: 512 * KIB,
  maxHeight: 2400,
  maxWidth: 2400,
});

export const builtImageBudgetBytes = 8 * 1024 * KIB;
export const builtImageMaxBytes = 512 * KIB;
