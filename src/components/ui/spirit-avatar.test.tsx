import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SpiritAvatar, spiritForSeed, spiritLabels } from './spirit-avatar';

describe('spiritForSeed', () => {
  it('maps the same seed to the same variant every time', () => {
    const first = spiritForSeed('色彩體系與應用');
    expect(spiritForSeed('色彩體系與應用')).toBe(first);
    expect(['red', 'blue', 'green']).toContain(first);
  });

  it('resolves a mentor label for any seed', () => {
    for (const seed of ['光與色', '數位色彩', '配色原理', '']) {
      expect(spiritLabels[spiritForSeed(seed)]).toMatch(/^[紅藍綠]精靈導師$/u);
    }
  });
});

describe('SpiritAvatar', () => {
  it('renders a decorative pixel figure with the variant class', () => {
    const { container } = render(<SpiritAvatar variant="green" />);
    const avatar = container.querySelector('.spirit-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('spirit-avatar--green');
  });
});
