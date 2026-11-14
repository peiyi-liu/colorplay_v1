import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { baseState } from '../pages/live-pages.test-fixtures';
import { StudentLiveStatusBar } from './student-live-status-bar';

it.each(['connected', 'connecting', 'disconnected'] as const)(
  'describes server membership separately from this browser connection (%s)',
  (connectionStatus) => {
    render(
      <StudentLiveStatusBar
        connectionStatus={connectionStatus}
        state={{
          ...baseState,
          participantCount: 3,
          currentPosition: 2,
          questionCount: 10,
        }}
      />,
    );
    expect(screen.getByText('已加入 3 人')).toBeVisible();
    expect(screen.getByText('第 2 / 10 題')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      {
        connected: '連線正常',
        connecting: '連線中…',
        disconnected: '連線中斷',
      }[connectionStatus],
    );
    expect(screen.queryByText(/在線|全員準備/u)).not.toBeInTheDocument();
  },
);
