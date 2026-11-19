import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  baseState,
  renderWith,
  repositoryWith,
  SESSION_ID,
} from './live-pages.test-fixtures';
import { LiveSessionPage } from './live-session-page';
import { TeacherLiveSessionPage } from './teacher-live-session-page';

const setup = (host: boolean) => {
  const callbacks: ((status: string, error?: Error) => void)[] = [];
  const client = {
    channel: vi.fn((topic: string) => {
      void topic;
      const channel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(
          (callback: (status: string, error?: Error) => void) => {
            callbacks.push(callback);
            callback('SUBSCRIBED');
            return channel;
          },
        ),
      };
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  };
  const repository = repositoryWith({
    getState: vi.fn().mockResolvedValue({ ...baseState, isHost: host }),
  });
  const Page = host ? TeacherLiveSessionPage : LiveSessionPage;
  renderWith(
    <Page
      client={client as unknown as SupabaseClient<Database>}
      repository={repository}
      sessionId={SESSION_ID}
    />,
  );
  return { callbacks, client, repository };
};
const tick = async (ms = 0) => {
  await act(() => vi.advanceTimersByTimeAsync(ms));
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([false, true])(
  'offers one manual transport recovery on the actual page (host=%s)',
  async (host) => {
    const test = setup(host);
    await tick(1);
    if (host)
      expect(
        screen.getByRole('region', { name: 'Live 投影模式' }),
      ).toBeVisible();
    else expect(screen.getByText('連線正常')).toBeVisible();
    for (const [index, delay] of [500, 1000, 0].entries()) {
      act(() => test.callbacks[host ? index * 2 : index]?.('CHANNEL_ERROR'));
      await tick(delay);
    }
    const button = screen.getByRole('button', { name: '重新連線' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await tick(1);
    expect(test.client.channel).toHaveBeenCalledTimes(host ? 8 : 4);
    expect(
      test.client.channel.mock.calls.filter(([topic]) =>
        topic.startsWith('live-session:'),
      ),
    ).toHaveLength(4);
    expect(test.repository.join).not.toHaveBeenCalled();
    expect(test.repository.submitAnswer).not.toHaveBeenCalled();
    expect(test.repository.finalize).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: '重新連線' }),
    ).not.toBeInTheDocument();
  },
);

it.each([false, true])(
  'uses the existing refusal flow for explicit permission denial (host=%s)',
  async (host) => {
    const test = setup(host);
    await tick(1);
    act(() =>
      test.callbacks[0]?.(
        'CHANNEL_ERROR',
        new Error(
          'Unauthorized: You do not have permissions to read from this Channel topic: synthetic-private-marker',
        ),
      ),
    );
    await tick(5000);
    expect(screen.getByRole('alert')).toHaveTextContent(
      host ? '你不是主持人' : '你不是參與者',
    );
    expect(
      screen.queryByRole('button', { name: '重新連線' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/synthetic-private-marker/),
    ).not.toBeInTheDocument();
    expect(test.client.channel).toHaveBeenCalledTimes(host ? 2 : 1);
    expect(
      test.client.channel.mock.calls.filter(([topic]) =>
        topic.startsWith('live-session:'),
      ),
    ).toHaveLength(1);
  },
);
