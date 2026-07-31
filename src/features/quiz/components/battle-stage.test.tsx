import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BattleStage } from './battle-stage';

describe('BattleStage', () => {
  it('is decoration-only and reflects the phase as a class', () => {
    const { container } = render(<BattleStage comboCount={0} phase="idle" />);
    const stage = container.querySelector('.battle-stage');
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    expect(stage).toHaveClass('battle-stage--idle');
    expect(container.querySelector('.battle-stage__slash')).toBeNull();
  });

  it('shows the slash only while attacking, before any verdict exists', () => {
    const { container } = render(
      <BattleStage comboCount={0} phase="attacking" />,
    );
    expect(container.querySelector('.battle-stage__slash')).not.toBeNull();
    expect(container.textContent).not.toContain('MISS');
  });

  it('labels miss and enemy strike phases', () => {
    const miss = render(<BattleStage comboCount={0} phase="miss" />);
    expect(miss.container.textContent).toContain('MISS');
    const strike = render(<BattleStage comboCount={0} phase="enemyStrike" />);
    expect(strike.container.textContent).toContain('魔物反擊！');
  });

  it('shows COMBO only from 2 up', () => {
    const one = render(<BattleStage comboCount={1} phase="idle" />);
    expect(one.container.textContent).not.toContain('COMBO');
    const three = render(<BattleStage comboCount={3} phase="hit" />);
    expect(three.container.textContent).toContain('COMBO ×3');
  });
});
