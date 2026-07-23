import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Chip } from './chip';
import { SectionHeader } from './section-header';

describe('SectionHeader', () => {
  it('renders chip, title, description and actions', () => {
    render(
      <SectionHeader
        chip={<Chip tone="primary">💎 系統外觀商店</Chip>}
        title="代幣外觀商店"
        description="使用色彩代幣解鎖專屬外觀。"
        actions={<button type="button">匯出</button>}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '代幣外觀商店' }),
    ).toBeInTheDocument();
    expect(screen.getByText('💎 系統外觀商店')).toBeInTheDocument();
    expect(screen.getByText('使用色彩代幣解鎖專屬外觀。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '匯出' })).toBeInTheDocument();
  });
});
