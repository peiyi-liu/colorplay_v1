import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BLOOK_ART_CODES, BlookArt } from './blook-art';

describe('BlookArt', () => {
  it('renders a mapped ref image with stable sizing and loading hints', () => {
    render(<BlookArt label="小狐狸" size={72} stableCode="little_fox" />);

    const image = screen.getByRole('img', { name: '小狐狸' });
    expect(image).toHaveAttribute('src', '/assets/blooks/little_fox-128.webp');
    expect(image).toHaveAttribute(
      'srcset',
      '/assets/blooks/little_fox-128.webp 128w, /assets/blooks/little_fox-256.webp 256w',
    );
    expect(image).toHaveAttribute('sizes', '72px');
    expect(image).toHaveAttribute('width', '72');
    expect(image).toHaveAttribute('height', '72');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
  });

  it('keeps unlabeled mapped art decorative', () => {
    const { container } = render(
      <BlookArt emoji="🦊" stableCode="little_fox" />,
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to emoji for an unknown stable code', () => {
    render(<BlookArt emoji="🦕" label="未知角色" stableCode="future_blook" />);

    expect(screen.getByLabelText('未知角色')).toHaveTextContent('🦕');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('exports every supplied stable code exactly once', () => {
    expect(BLOOK_ART_CODES).toEqual([
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
    ]);
  });
});
