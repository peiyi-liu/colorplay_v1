// Manually calibrated against the empty terrain pads, not DOM data-ground-*.
// Coordinates use each artwork's native pixels; these are visual reference
// estimates, not an automatically inferred geometric center of irregular pads.
// The visible building footprint center is (256, 336) in its 512x384 canvas.
export const LEARNING_MAP_TERRAIN_SHA256 = {
  desktop: 'a628be545e068b2bd96737044d62de01260770ebf91c1ed9ab532cbc526a9522',
  mobile: '5d533c366b1d8da6665817d083795210d5095d5d0cc7d6b8f94d9e6684044aec',
} as const;

export const LEARNING_MAP_PLATFORMS = {
  desktop: [
    { x: 480, y: 230 },
    { x: 1010, y: 210 },
    { x: 805, y: 475 },
    { x: 390, y: 490 },
    { x: 1140, y: 715 },
    { x: 485, y: 760 },
  ],
  mobile: [
    { x: 480, y: 275 },
    { x: 505, y: 550 },
    { x: 350, y: 710 },
    { x: 555, y: 900 },
    { x: 325, y: 1055 },
    { x: 520, y: 1230 },
  ],
} as const;
