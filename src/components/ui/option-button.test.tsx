import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OptionButton } from './option-button';

describe('OptionButton', () => {
  it('renders variant class and shape symbol', () => {
    render(
      <OptionButton variant="rose" shape="triangle" onClick={vi.fn()}>
        互補色對比
      </OptionButton>,
    );
    const button = screen.getByRole('button', { name: /互補色對比/u });
    expect(button.className).toContain('ui-option--rose');
    expect(button.textContent).toContain('▲');
  });

  it('fires onClick from keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OptionButton variant="sky" shape="square" onClick={onClick}>
        類似色對比
      </OptionButton>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('locked state disables the button and shows a non-color cue', () => {
    render(
      <OptionButton
        variant="amber"
        shape="circle"
        state="locked"
        onClick={vi.fn()}
      >
        明度對比
      </OptionButton>,
    );
    const button = screen.getByRole('button', { name: /明度對比/u });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('selected state shows a check and explicit confirmation', () => {
    render(
      <OptionButton
        variant="emerald"
        shape="diamond"
        state="selected"
        onClick={vi.fn()}
      >
        D
      </OptionButton>,
    );

    const button = screen.getByRole('button', { name: /D.*已選擇/u });
    expect(button).toHaveClass('ui-option--state-selected');
    expect(button.querySelector('svg')).not.toBeNull();
  });
});
