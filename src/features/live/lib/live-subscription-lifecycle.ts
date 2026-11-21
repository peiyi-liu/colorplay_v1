export type LiveConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export type LiveSubscriptionState = Readonly<{
  status: LiveConnectionStatus;
  reconnecting: boolean;
  blocked: boolean;
}>;

interface Options<Channel> {
  createChannel: () => Channel;
  attach: (
    channel: Channel,
    broadcast: (message: { payload: unknown }) => void,
    status: (status: string, error?: Error) => void,
  ) => void;
  removeChannel: (channel: Channel) => Promise<unknown>;
  onChange: (state: LiveSubscriptionState) => void;
  onSubscribed: () => void;
  onBroadcast: (message: { payload: unknown }) => void;
  random?: () => number;
}

// Inspect only the SDK Error's own data property. Unknown transport errors
// remain retryable; neither arbitrary causes nor Unauthorized substrings count.
const isAccessDenial = (error: Error | undefined): boolean => {
  if (!(error instanceof Error)) return false;
  const message: unknown = Object.getOwnPropertyDescriptor(
    error,
    'message',
  )?.value;
  return (
    typeof message === 'string' &&
    (/^(?:Unauthorized|Forbidden|AUTH_REQUIRED|JWT expired|Invalid token|Token has expired)$/i.test(
      message,
    ) ||
      /^You do not have permissions to read from this Topic\b/.test(message) ||
      /^Unauthorized: You do not have permissions to read from this Channel topic: .+$/.test(
        message,
      ))
  );
};

export function createLiveSubscriptionLifecycle<Channel>(
  options: Options<Channel>,
) {
  const random = options.random ?? Math.random;
  let disposed = false;
  let generation = 0;
  let owned: { channel: Channel } | undefined;
  let removing: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let state: LiveSubscriptionState = {
    status: 'connecting',
    reconnecting: false,
    blocked: false,
  };
  const update = (next: LiveSubscriptionState) => {
    state = next;
    if (!disposed) options.onChange(next);
  };
  const removeOwned = (): Promise<boolean> => {
    if (removing) return removing;
    const previous = owned;
    if (!previous) return Promise.resolve(true);
    // Keep ownership until the server/SDK confirms removal, including failures.
    removing = (async () => {
      try {
        const result = await options.removeChannel(previous.channel);
        if (result !== 'ok') return false;
        if (owned === previous) owned = undefined;
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      removing = undefined;
    });
    return removing;
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || owned) return;
      const current = ++generation;
      const active = () => !disposed && generation === current;
      const failed = (error?: Error) => {
        if (!active()) return;
        const retired = ++generation; // Fence broadcasts and intentional CLOSED callbacks first.
        const blocked = isAccessDenial(error);
        const backoff = blocked ? undefined : [500, 1000][attempts];
        if (backoff !== undefined) attempts += 1;
        update({
          status: 'disconnected',
          reconnecting: backoff !== undefined,
          blocked,
        });
        void removeOwned().then((removed) => {
          if (disposed || generation !== retired) return;
          if (!removed || backoff === undefined) {
            update({ status: 'disconnected', reconnecting: false, blocked });
            return;
          }
          schedule(backoff + Math.round(random() * 250));
        });
      };
      try {
        const channel = options.createChannel();
        owned = { channel };
        options.attach(
          channel,
          (message) => {
            if (active()) options.onBroadcast(message);
          },
          (status, error) => {
            if (!active()) return;
            if (status === 'SUBSCRIBED') {
              update({
                status: 'connected',
                reconnecting: false,
                blocked: false,
              });
              options.onSubscribed();
            } else if (
              status === 'CHANNEL_ERROR' ||
              status === 'TIMED_OUT' ||
              status === 'CLOSED'
            ) {
              failed(error);
            }
          },
        );
      } catch {
        failed();
      }
    }, delay);
  };
  schedule(Math.round(random() * 1500));
  return {
    reconnect: () => {
      if (
        disposed ||
        state.status !== 'disconnected' ||
        state.reconnecting ||
        state.blocked
      )
        return;
      const cycle = ++generation;
      attempts = 0;
      update({ status: 'disconnected', reconnecting: true, blocked: false });
      void removeOwned().then((removed) => {
        if (disposed || generation !== cycle) return;
        if (removed) schedule(Math.round(random() * 1500));
        else
          update({
            status: 'disconnected',
            reconnecting: false,
            blocked: false,
          });
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      ++generation;
      clearTimer();
      void removeOwned();
    },
  };
}
