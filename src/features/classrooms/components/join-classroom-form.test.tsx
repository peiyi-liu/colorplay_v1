import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type ClassroomRepository, ClassroomRepositoryError } from '../types';
import { JoinClassroomForm } from './join-classroom-form';

const joined = {
  classroomId: 'ca000000-0000-4000-8000-000000000001',
  classroomName: '色彩一班',
  joinedAt: '2026-07-17T01:00:00.000Z',
  membershipStatus: 'active' as const,
};
const repository = (
  joinClassroom: ClassroomRepository['joinClassroom'],
): ClassroomRepository => ({
  createClassroom: vi.fn(),
  getOwnedMembers: vi.fn(),
  joinClassroom,
  listMine: vi.fn(),
  listOwned: vi.fn(),
  rotateJoinCode: vi.fn(),
});
const renderForm = (
  classroomRepository: ClassroomRepository,
  onJoined = vi.fn(),
) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(
    <JoinClassroomForm
      initialJoinCode="ABCD-1234-EF56-7890"
      onJoined={onJoined}
      repository={classroomRepository}
    />,
    { wrapper: Wrapper },
  );
  return onJoined;
};

describe('JoinClassroomForm', () => {
  it('shows the URL code for explicit confirmation without auto-joining', () => {
    const joinClassroom = vi.fn();
    renderForm(repository(joinClassroom));
    const input = screen.getByRole('textbox', { name: '班級加入碼' });
    const submit = screen.getByRole('button', { name: '加入班級' });
    expect(input).toHaveValue('ABCD-1234-EF56-7890');
    expect(joinClassroom).not.toHaveBeenCalled();
    expect(
      input.closest('[data-interaction-group="join-classroom"]'),
    ).toContainElement(submit);
  });

  it('locks one request while pending and reports success', async () => {
    let resolve!: (value: typeof joined) => void;
    const joinClassroom = vi.fn(
      () => new Promise<typeof joined>((done) => (resolve = done)),
    );
    const onJoined = renderForm(repository(joinClassroom));
    await userEvent.click(screen.getByRole('button', { name: '加入班級' }));
    expect(screen.getByRole('button', { name: '加入中…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '加入中…' }));
    expect(joinClassroom).toHaveBeenCalledOnce();
    resolve(joined);
    await waitFor(() => {
      expect(onJoined).toHaveBeenCalledWith(joined.classroomId);
    });
  });

  it('keeps an understandable invalid or expired code error beside the form', async () => {
    renderForm(
      repository(
        vi.fn().mockRejectedValue(new ClassroomRepositoryError('INVALID_CODE')),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: '加入班級' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '加入碼無效或已失效，請向老師確認。',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('INVALID_CODE');
  });
});
