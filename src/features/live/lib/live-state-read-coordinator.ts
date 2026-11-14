import type { LiveSessionState } from '../types';

type Read = () => Promise<LiveSessionState>;
interface Slot {
  read: Read;
  promise: Promise<LiveSessionState>;
  resolve: (state: LiveSessionState) => void;
  reject: (error: unknown) => void;
}
interface Entry {
  active: Slot | null;
  queued: Slot | null;
  idle: Set<() => void>;
}
const owners = new WeakMap<object, Map<string, Entry>>();
const slot = (read: Read): Slot => {
  // Promise executors assign these synchronously before the slot is returned.
  let resolve!: Slot['resolve'];
  let reject!: Slot['reject'];
  const promise = new Promise<LiveSessionState>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { read, promise, resolve, reject };
};
const start = (
  entries: Map<string, Entry>,
  key: string,
  entry: Entry,
  next: Slot,
) => {
  entry.active = next;
  const settled = () => {
    const queued = entry.queued;
    entry.queued = null;
    if (queued) start(entries, key, entry, queued);
    else {
      entry.active = null;
      entries.delete(key);
      for (const resolve of entry.idle) resolve();
      entry.idle.clear();
    }
  };
  void next.promise.then(settled, settled);
  try {
    void next.read().then(next.resolve, next.reject);
  } catch (error) {
    next.reject(error);
  }
};

// Query cancellation can precede the actual repository response. Keep physical
// reads single-flight across observers, folding canceled/refetch bursts together.
export const readLiveState = (
  owner: object,
  key: string,
  read: Read,
): Promise<LiveSessionState> => {
  let entries = owners.get(owner);
  if (!entries) {
    entries = new Map();
    owners.set(owner, entries);
  }
  let entry = entries.get(key);
  if (!entry) {
    entry = { active: null, queued: null, idle: new Set() };
    entries.set(key, entry);
  }
  if (entry.active) {
    entry.queued ??= slot(read);
    entry.queued.read = read;
    return entry.queued.promise;
  }
  const next = slot(read);
  start(entries, key, entry, next);
  return next.promise;
};

export const pendingLiveStateReads = (
  owner: object,
  key: string,
): Promise<void> | undefined => {
  const entry = owners.get(owner)?.get(key);
  if (!entry?.active) return undefined;
  return new Promise<void>((resolve) => {
    entry.idle.add(resolve);
  });
};
