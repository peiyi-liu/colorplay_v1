import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { ClassroomCodeReceiptView } from './classroom-code-receipt';

const receipt = {
  classroomId: 'ca000000-0000-4000-8000-000000000001',
  classroomName: '色彩一班',
  joinCode: 'ABCD-1234-EF56-7890',
  joinCodeVersion: 2,
} as const;

afterEach(() => {
  vi.useRealTimers();
});

it('shows a one-time code with explicit guidance and clears it on dismissal', async () => {
  const onDismiss = vi.fn();
  render(<ClassroomCodeReceiptView onDismiss={onDismiss} receipt={receipt} />);
  expect(screen.getByText('ABCD-1234-EF56-7890')).toBeVisible();
  expect(screen.getByText(/只顯示這一次/u)).toBeVisible();
  expect(document.body).not.toHaveTextContent(
    'ca000000-0000-4000-8000-000000000001',
  );
  await userEvent.click(screen.getByRole('button', { name: '我已保存，關閉' }));
  expect(onDismiss).toHaveBeenCalledOnce();
});

it('copies the join code to the clipboard and reverts the label after a short delay', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(
    <ClassroomCodeReceiptView onDismiss={vi.fn()} receipt={receipt} />,
  );

  // 純前端行為，用 clipboard mock 驗證：不用 userEvent（其內部 timer 排程會
  // 跟 vi.useFakeTimers 互卡),改用原生 click + 手動排空 microtask，同
  // src/components/ui/toast.test.tsx 既有手法。
  await act(async () => {
    screen.getByRole('button', { name: '複製' }).click();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(writeText).toHaveBeenCalledWith('ABCD-1234-EF56-7890');
  expect(screen.getByRole('button', { name: '已複製' })).toBeVisible();

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByRole('button', { name: '複製' })).toBeVisible();
});
