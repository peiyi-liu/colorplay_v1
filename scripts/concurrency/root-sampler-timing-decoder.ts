import { linuxHostSampleSchema } from './capacity-linux-health';
import { rootSamplerFailureSchema } from './root-helper-contracts';
export const decodeRootSamplerTiming = (text: string) => {
  const authority = 'SAMPLE_AUTHORITY_NOT_EVALUATED' as const;
  try {
    if (Buffer.byteLength(text) > 131072) throw Error();
    const raw: unknown = JSON.parse(text);
    const parsed = linuxHostSampleSchema.safeParse(raw);
    const failure = rootSamplerFailureSchema.safeParse(raw);
    const body = parsed.success
      ? parsed.data
      : failure.success && failure.data.result === 'HOST_SAMPLE_UNAVAILABLE'
        ? failure.data
        : null;
    if (!body) return { collection: 'UNAVAILABLE' as const, authority };
    if (body.samplerTiming === undefined)
      return { collection: 'UNOBSERVED' as const, authority };
    return {
      collection: body.samplerTiming.collection,
      authority,
      samplerTiming: body.samplerTiming,
    };
  } catch {
    return { collection: 'UNAVAILABLE' as const, authority };
  }
};
