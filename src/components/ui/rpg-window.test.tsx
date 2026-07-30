import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RpgWindow } from './rpg-window';

describe('RpgWindow', () => {
  it('renders title heading and body content', () => {
    render(<RpgWindow title="系統訊息">歡迎來到色彩王國</RpgWindow>);
    expect(
      screen.getByRole('heading', { name: '系統訊息' }),
    ).toBeInTheDocument();
    expect(screen.getByText('歡迎來到色彩王國')).toBeInTheDocument();
  });

  it('omits heading when no title given', () => {
    render(<RpgWindow>純內容</RpgWindow>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('merges custom className onto the window container', () => {
    render(<RpgWindow className="quiz-window">內容</RpgWindow>);
    const region = screen.getByText('內容').closest('.rpg-window');
    expect(region).not.toBeNull();
    expect(region).toHaveClass('quiz-window');
  });

  it('accepts a ReactNode title', () => {
    render(<RpgWindow title={<span>三寶石</span>}>內容</RpgWindow>);
    expect(screen.getByRole('heading', { name: '三寶石' })).toBeInTheDocument();
  });
});
