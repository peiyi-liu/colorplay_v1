import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { LiveJoinPageHarness } from './live-join-page.harness';

describe('LiveJoinPageHarness', () => {
  it('mounts in the student HUD and exposes the actual error state', async () => {
    render(<LiveJoinPageHarness />);
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', { name: '加入 Live 課堂' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '返回前一頁' })).toBeVisible();

    await user.type(screen.getByLabelText('輸入 6 位加入代碼'), '123456');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(
      await screen.findByText('代碼無效或課堂尚未開放，請向老師確認。'),
    ).toBeVisible();
  });
});
