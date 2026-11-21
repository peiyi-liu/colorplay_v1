import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database';

// Existing single-stream hook assertions now drive ACKs on two distinct SDK channels.
export const createLiveChannelFixture = () => {
  type Callback = (status: string, error?: Error) => void;
  type Broadcast = (message: { payload: unknown }) => void;
  const members = new Set<{
    topic: string;
    status?: Callback;
    broadcast?: Broadcast;
  }>();
  let lastStatus: string | undefined;
  const client = {
    channel: (topic: string) => {
      const member: {
        topic: string;
        status?: Callback;
        broadcast?: Broadcast;
      } = { topic };
      members.add(member);
      const channel = {
        on: (_type: string, _filter: unknown, callback: Broadcast) => {
          member.broadcast = callback;
          return channel;
        },
        subscribe: (callback: Callback) => {
          member.status = callback;
          if (lastStatus === 'SUBSCRIBED') callback(lastStatus);
          return channel;
        },
        member,
      };
      return channel;
    },
    removeChannel: (channel: { member: { topic: string } }) => {
      members.delete(channel.member);
      return Promise.resolve('ok');
    },
  } as unknown as SupabaseClient<Database>;
  return {
    client,
    broadcast: (payload: unknown) => {
      for (const member of members)
        if (member.topic.startsWith('live-session:'))
          member.broadcast?.({ payload });
    },
    status: (value: string) => {
      lastStatus = value;
      for (const member of [...members]) member.status?.(value);
    },
  };
};
