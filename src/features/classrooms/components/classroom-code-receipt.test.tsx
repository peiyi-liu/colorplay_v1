import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { ClassroomCodeReceiptView } from './classroom-code-receipt';

it('shows a one-time code with explicit guidance and clears it on dismissal', async () => {
  const onDismiss = vi.fn();
  render(
    <ClassroomCodeReceiptView
      onDismiss={onDismiss}
      receipt={{
        classroomId: 'ca000000-0000-4000-8000-000000000001',
        classroomName: '色彩一班',
        joinCode: 'ABCD-1234-EF56-7890',
        joinCodeVersion: 2,
      }}
    />,
  );
  expect(screen.getByText('ABCD-1234-EF56-7890')).toBeVisible();
  expect(screen.getByText(/只顯示這一次/u)).toBeVisible();
  expect(document.body).not.toHaveTextContent(
    'ca000000-0000-4000-8000-000000000001',
  );
  await userEvent.click(screen.getByRole('button', { name: '我已保存，關閉' }));
  expect(onDismiss).toHaveBeenCalledOnce();
});
