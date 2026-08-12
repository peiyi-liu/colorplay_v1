import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StudentHud } from './student-hud';

describe('StudentHud', () => {
  it('stays visible without reveal or dismiss interaction zones', () => {
    const { container } = render(
      <StudentHud>
        <button type="button">返回</button>
        <p>學習資訊</p>
      </StudentHud>,
    );

    expect(screen.getByRole('banner')).toHaveClass('hud-top--student');
    expect(screen.getByRole('button', { name: '返回' })).toBeVisible();
    expect(container.querySelector('.student-hud-reveal-zone')).toBeNull();
    expect(container.querySelector('.student-hud-dismiss-zone')).toBeNull();
  });
});
