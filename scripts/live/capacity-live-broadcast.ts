import { TextDecoder } from 'node:util';

const MAX_FRAME_BYTES = 64 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const liveTopic = (value: unknown): boolean =>
  typeof value === 'string' &&
  value.length <= 255 &&
  Buffer.byteLength(value) <= 255 &&
  /^(?:realtime:)?live-session:[A-Za-z0-9_-]+$/u.test(value);

// Only DB JSON notifications are needed. Binary user payloads (encoding 0)
// remain unsupported; this observer returns no payload or metadata to callers.
const binaryBroadcast = (raw: Buffer): boolean => {
  if (raw.length < 5 || raw[0] !== 4 || raw[4] !== 1) return false;
  const topicLength = raw[1] ?? 0;
  const eventLength = raw[2] ?? 0;
  const metadataLength = raw[3] ?? 0;
  const eventStart = 5 + topicLength;
  const metadataStart = eventStart + eventLength;
  const payloadStart = metadataStart + metadataLength;
  if (!topicLength || !eventLength || payloadStart >= raw.length) return false;
  if (
    !liveTopic(utf8.decode(raw.subarray(5, eventStart))) ||
    utf8.decode(raw.subarray(eventStart, metadataStart)) !== 'live_state'
  )
    return false;
  if (
    metadataLength &&
    !object(JSON.parse(utf8.decode(raw.subarray(metadataStart, payloadStart))))
  )
    return false;
  return object(JSON.parse(utf8.decode(raw.subarray(payloadStart))));
};

export const isLiveBroadcast = (raw: string | Buffer): boolean => {
  try {
    if (typeof raw === 'string') {
      if (
        raw.length > MAX_FRAME_BYTES ||
        Buffer.byteLength(raw) > MAX_FRAME_BYTES
      )
        return false;
    } else {
      if (raw.length > MAX_FRAME_BYTES) return false;
      if (raw[0] === 4) return binaryBroadcast(raw);
    }
    const parsed: unknown = JSON.parse(
      typeof raw === 'string' ? raw : utf8.decode(raw),
    );
    const frame = Array.isArray(parsed) ? parsed : undefined;
    const record = object(parsed) ? parsed : undefined;
    if (frame && frame.length !== 5) return false;
    const payload: unknown = record?.payload ?? frame?.[4];
    return (
      (record?.event ?? frame?.[3]) === 'broadcast' &&
      liveTopic(record?.topic ?? frame?.[2]) &&
      object(payload) &&
      payload.event === 'live_state' &&
      (!Object.hasOwn(payload, 'payload') || object(payload.payload)) &&
      (!Object.hasOwn(payload, 'meta') || object(payload.meta))
    );
  } catch {
    return false;
  }
};
