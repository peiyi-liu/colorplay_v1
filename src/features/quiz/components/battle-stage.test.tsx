import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BattleStage } from './battle-stage';

describe('BattleStage', () => {
  it('shows a full-health spirit for the current question', () => {
    const { container } = render(
      <BattleStage comboCount={0} phase="idle" questionSeed="3-1-01" />,
    );
    const stage = container.querySelector('.battle-stage');
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    expect(stage).toHaveClass('battle-stage--idle');
    expect(stage).toHaveAttribute('data-enemy-health', 'full');
    expect(container.querySelector('.spirit-avatar')).not.toBeNull();
    expect(container.querySelector('.battle-stage__slash')).toBeNull();
  });

  it('drains the spirit health only after a correct server verdict', () => {
    const { container, rerender } = render(
      <BattleStage comboCount={0} phase="attacking" questionSeed="3-1-01" />,
    );
    expect(container.querySelector('.battle-stage')).toHaveAttribute(
      'data-enemy-health',
      'full',
    );

    rerender(<BattleStage comboCount={0} phase="hit" questionSeed="3-1-01" />);
    expect(container.querySelector('.battle-stage')).toHaveAttribute(
      'data-enemy-health',
      'empty',
    );
  });

  it('uses the question seed to replace the spirit on the next question', () => {
    const { container, rerender } = render(
      <BattleStage comboCount={0} phase="idle" questionSeed="3-1-01" />,
    );
    const firstSpiritClass =
      container.querySelector('.spirit-avatar')?.className;

    rerender(<BattleStage comboCount={0} phase="idle" questionSeed="3-1-02" />);
    expect(container.querySelector('.spirit-avatar')?.className).not.toBe(
      firstSpiritClass,
    );
  });

  it('shows the slash only while attacking, before any verdict exists', () => {
    const { container } = render(
      <BattleStage comboCount={0} phase="attacking" questionSeed="3-1-01" />,
    );
    expect(container.querySelector('.battle-stage__slash')).not.toBeNull();
    expect(container.textContent).not.toContain('MISS');
  });

  it('labels miss and enemy strike phases', () => {
    const miss = render(
      <BattleStage comboCount={0} phase="miss" questionSeed="3-1-01" />,
    );
    expect(miss.container.textContent).toContain('MISS');
    const strike = render(
      <BattleStage comboCount={0} phase="enemyStrike" questionSeed="3-1-01" />,
    );
    expect(strike.container.textContent).toContain('魔物反擊！');
  });

  it('shows COMBO only from 2 up', () => {
    const one = render(
      <BattleStage comboCount={1} phase="idle" questionSeed="3-1-01" />,
    );
    expect(one.container.textContent).not.toContain('COMBO');
    const three = render(
      <BattleStage comboCount={3} phase="hit" questionSeed="3-1-01" />,
    );
    expect(three.container.textContent).toContain('COMBO ×3');
  });
});
