import { z } from 'zod';

import {
  createLiveSubscriptionLifecycle,
  type LiveSubscriptionState,
} from './live-subscription-lifecycle';

export type LiveSessionTopic = 'SHARED' | 'HOST_PROGRESS';
interface Message {
  payload: unknown;
}
type Status = (status: string, error?: Error) => void;
interface Options<Channel> {
  sessionId: string;
  createChannel: (topic: LiveSessionTopic) => Channel;
  attach: (
    channel: Channel,
    topic: LiveSessionTopic,
    broadcast: (message: Message) => void,
    status: Status,
  ) => void;
  removeChannel: (channel: Channel) => Promise<unknown>;
  onChange: (state: LiveSubscriptionState) => void;
  onSubscribed: () => void;
  onBroadcast: (message: Message) => void;
  random?: () => number;
}
const data = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw Error();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw Error();
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!('value' in descriptor)) throw Error();
    result[key] = descriptor.value;
  }
  return result;
};
const transportId = z.uuid();
const progress = (message: Message, sessionId: string) => {
  try {
    const value = data(data(message).payload);
    const keyCount = Object.keys(value).length;
    const wireShape = Object.hasOwn(value, 'id')
      ? keyCount === 5 &&
        typeof value.id === 'string' &&
        value.id.length === 36 &&
        transportId.safeParse(value.id).success
      : keyCount === 4;
    return (
      wireShape &&
      value.session_id === sessionId &&
      value.state === 'question_open' &&
      typeof value.state_version === 'number' &&
      Number.isSafeInteger(value.state_version) &&
      value.state_version >= 0 &&
      typeof value.answered_count === 'number' &&
      Number.isSafeInteger(value.answered_count) &&
      value.answered_count >= 0
    );
  } catch {
    return false;
  }
};

// One original lifecycle owns the whole group: a second channel is not a second retry loop.
export const createLiveSessionTopics = <Channel>(options: Options<Channel>) => {
  interface Member {
    channel: Channel;
    active: boolean;
    acknowledged: boolean;
    removing?: Promise<unknown>;
    removalFailed?: boolean;
  }
  interface Group {
    members: Map<LiveSessionTopic, Member>;
    all: Set<Member>;
    broadcast: (message: Message) => void;
    status: Status;
    retired: boolean;
    ready: boolean;
    removingProgress: boolean;
    removing?: Promise<unknown>;
  }
  let role: boolean | undefined;
  let disposed = false;
  let current: Group | undefined;
  let state: LiveSubscriptionState = {
    status: 'connecting',
    reconnecting: false,
    blocked: false,
  };
  const pending = new Set<Promise<unknown>>();
  const track = <T>(task: Promise<T>) => {
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  };
  const ready = (group: Group) =>
    role !== undefined &&
    !group.retired &&
    !group.removingProgress &&
    group.members.get('SHARED')?.acknowledged === true &&
    (!role || group.members.get('HOST_PROGRESS')?.acknowledged === true);
  const publish = () => {
    if (disposed) return;
    options.onChange(
      state.status === 'connected' && (!current || !ready(current))
        ? { status: 'connecting', reconnecting: false, blocked: false }
        : state,
    );
  };
  const remove = (member: Member) => {
    member.active = false;
    return (member.removing ??= track(
      (async () => {
        try {
          const result = await options.removeChannel(member.channel);
          member.removalFailed = result !== 'ok';
          return result;
        } catch {
          member.removalFailed = true;
          return 'error';
        }
      })(),
    ));
  };
  const acknowledge = (group: Group) => {
    if (
      disposed ||
      current !== group ||
      group.retired ||
      !ready(group) ||
      group.ready
    )
      return;
    group.ready = true;
    group.status('SUBSCRIBED');
  };
  const fail = (group: Group, value: string, error?: Error) => {
    if (disposed || current !== group || group.retired) return;
    group.retired = true;
    group.status(value, error);
  };
  const add = (group: Group, topic: LiveSessionTopic) => {
    if (
      disposed ||
      current !== group ||
      group.retired ||
      group.members.has(topic)
    )
      return;
    const member: Member = {
      channel: options.createChannel(topic),
      active: true,
      acknowledged: false,
    };
    group.members.set(topic, member);
    group.all.add(member);
    options.attach(
      member.channel,
      topic,
      (message) => {
        if (disposed || current !== group || group.retired || !member.active)
          return;
        if (
          topic === 'HOST_PROGRESS' &&
          (role !== true || !progress(message, options.sessionId))
        ) {
          fail(group, 'CHANNEL_ERROR');
          return;
        }
        group.broadcast(message);
      },
      (value, error) => {
        if (disposed || current !== group || group.retired || !member.active)
          return;
        if (value === 'SUBSCRIBED') {
          member.acknowledged = true;
          acknowledge(group);
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(value))
          fail(group, value, error);
      },
    );
  };
  const apply = (group: Group) => {
    if (disposed || current !== group || group.retired) return;
    if (role === true) {
      if (!group.removingProgress) add(group, 'HOST_PROGRESS');
    } else {
      const member = group.members.get('HOST_PROGRESS');
      if (member) {
        group.ready = false;
        group.removingProgress = true;
        group.members.delete('HOST_PROGRESS');
        void track(
          remove(member).then((result) => {
            group.removingProgress = false;
            if (result !== 'ok') {
              fail(group, 'CHANNEL_ERROR');
              return;
            }
            group.all.delete(member);
            try {
              apply(group);
            } catch (error) {
              fail(
                group,
                'CHANNEL_ERROR',
                error instanceof Error ? error : undefined,
              );
            }
          }),
        );
      }
    }
    publish();
    acknowledge(group);
  };
  const lifecycle = createLiveSubscriptionLifecycle<Group>({
    createChannel: () => {
      const group: Group = {
        members: new Map(),
        all: new Set(),
        broadcast: () => undefined,
        status: () => undefined,
        retired: false,
        ready: false,
        removingProgress: false,
      };
      current = group;
      return group;
    },
    attach: (group, broadcast, status) => {
      group.broadcast = broadcast;
      group.status = status;
      add(group, 'SHARED');
      apply(group);
    },
    removeChannel: (group) => {
      group.retired = true;
      return (group.removing ??= track(
        (async () => {
          const results = await Promise.all([...group.all].map(remove));
          if (results.some((result) => result !== 'ok')) return 'error';
          group.all.clear();
          group.members.clear();
          return 'ok';
        })(),
      ));
    },
    onChange: (next) => {
      state = next;
      publish();
    },
    onSubscribed: options.onSubscribed,
    onBroadcast: options.onBroadcast,
    ...(options.random ? { random: options.random } : {}),
  });
  return {
    setRole: (isHost: boolean | undefined) => {
      if (disposed || role === isHost) return;
      role = isHost;
      if (current) {
        current.ready = false;
        try {
          apply(current);
        } catch (error) {
          fail(
            current,
            'CHANNEL_ERROR',
            error instanceof Error ? error : undefined,
          );
        }
      }
    },
    reconnect: () => {
      if (
        !disposed &&
        state.status === 'disconnected' &&
        !state.reconnecting &&
        !state.blocked &&
        current
      ) {
        delete current.removing;
        for (const member of current.all) {
          if (member.removalFailed) {
            delete member.removing;
            delete member.removalFailed;
          }
        }
      }
      lifecycle.reconnect();
    },
    dispose: async () => {
      disposed = true;
      lifecycle.dispose();
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
};
