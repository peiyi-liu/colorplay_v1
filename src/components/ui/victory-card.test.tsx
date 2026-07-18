import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VictoryCard } from './victory-card';

describe('VictoryCard', () => {
  it('shows rewards and optional badge', () => {
    render(
      <VictoryCard
        title="階段任務挑戰完成！"
        xp={40}
        tokens={5}
        badgeName="色彩修理工"
        onRetry={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '階段任務挑戰完成！' }),
    ).toBeInTheDocument();
    expect(screen.getByText('+40 XP')).toBeInTheDocument();
    expect(screen.getByText('+5 代幣')).toBeInTheDocument();
    expect(screen.getByText(/色彩修理工/u)).toBeInTheDocument();
  });

  it('hides next action when absent and fires retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<VictoryCard title="完成" xp={0} tokens={0} onRetry={onRetry} />);
    expect(
      screen.queryByRole('button', { name: /下一關/u }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /重新練習此題/u }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
