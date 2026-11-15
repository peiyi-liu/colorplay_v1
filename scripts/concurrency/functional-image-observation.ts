import type { Page } from '@playwright/test';
import { z } from 'zod';
import type { FunctionalScope } from './config';
import { requiredProofs, type FunctionalStage } from './functional-receipt';

export const approvedStaticImagePathsSchema = z
  .array(
    z
      .string()
      .max(512)
      .regex(/^\/assets\/blooks\/[A-Za-z0-9_-]+-(?:128|256)\.webp$/u),
  )
  .min(1)
  .max(1000)
  .refine((paths) =>
    paths.every((path, i) => i === 0 || (paths[i - 1] ?? '') < path),
  );
const proofSchema = z
  .object({ result: z.enum(['DECODED', 'RETIRED', 'REJECTED', 'UNAVAILABLE']) })
  .strict();
type Proof = z.infer<typeof proofSchema>['result'];
interface ProofInput {
  origin: string;
  pathname: string;
  documentUrl: string;
  approved: readonly string[];
}
// Self-contained browser callback: no imported symbols or transpiler-named inner functions.
export function readFunctionalImageProof(input: ProofInput): { result: Proof } {
  try {
    if (
      location.href !== input.documentUrl ||
      new URL(location.href).origin !== input.origin ||
      !['interactive', 'complete'].includes(document.readyState) ||
      !document.body.isConnected ||
      !document.getElementById('root')?.isConnected ||
      !document.getElementById('main-content')?.isConnected
    )
      return { result: 'UNAVAILABLE' };
    const images = document.querySelectorAll('img');
    if (images.length > 1000) return { result: 'UNAVAILABLE' };
    let visible = 0;
    for (let index = 0; index < images.length; index++) {
      const image = images.item(index);
      const values = [image.getAttribute('src') ?? '', image.currentSrc];
      const srcset = image.getAttribute('srcset') ?? '';
      if (srcset.length > 8192) return { result: 'UNAVAILABLE' };
      const candidates = srcset ? srcset.split(',') : [];
      if (candidates.length > 32) return { result: 'UNAVAILABLE' };
      for (const candidate of candidates) {
        const parts = candidate.trim().split(/\s+/u);
        if (
          !parts[0] ||
          parts.length > 2 ||
          (parts[1] &&
            !/^(?:[1-9][0-9]*w|(?:[0-9]+(?:\.[0-9]+)?)x)$/u.test(parts[1]))
        )
          return { result: 'UNAVAILABLE' };
        values.push(parts[0]);
      }
      let matching = false;
      let invalid = false;
      for (const value of values) {
        if (!value) continue;
        if (value.length > 32768) return { result: 'UNAVAILABLE' };
        const url = new URL(value, document.baseURI);
        const safe =
          url.origin === input.origin &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          input.approved.includes(url.pathname);
        if (url.pathname === input.pathname) {
          if (!safe) return { result: 'REJECTED' };
          matching = true;
        }
        if (!safe) invalid = true;
      }
      if (!matching) continue;
      if (invalid) return { result: 'REJECTED' };
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.display === 'none' ||
        ['hidden', 'collapse'].includes(style.visibility)
      )
        continue;
      visible++;
      if (!image.currentSrc || !image.complete || image.naturalWidth <= 0)
        return { result: 'REJECTED' };
    }
    return { result: visible ? 'DECODED' : 'RETIRED' };
  } catch {
    return { result: 'UNAVAILABLE' };
  }
}

const requestSchema = z.object({
  requestId: z.string().min(1).max(180),
  type: z.literal('Image'),
  documentURL: z.string().max(32768),
  loaderId: z.string().min(1).max(180),
  request: z.object({ url: z.string().max(32768), method: z.literal('GET') }),
});
interface Candidate {
  page: Page;
  actor: string;
  phase: FunctionalStage;
  generation: number;
  documentUrl: string;
  pathname: string;
  used: boolean;
  badResponse: boolean;
}
export const createFunctionalImages = (
  scope: FunctionalScope,
  phase: () => FunctionalStage | null,
  approved: readonly string[],
) => {
  const origin = new URL(scope.appUrl).origin;
  const allowed = new Set(approved);
  const pages = new Map<
    Page,
    { actor: () => string | null; generation: number; stop: () => void }
  >();
  const records = new Map<string, Candidate>();
  const seen = new Set<string>();
  const pending = new Set<Promise<Proof>>();
  const stops = new Set<() => void>();
  let stopped = false;
  let expected = 0;
  let decoded = 0;
  let retired = 0;
  let unavailable = 0;
  const current = (record: Candidate) =>
    !stopped &&
    !record.page.isClosed() &&
    pages.get(record.page)?.generation === record.generation &&
    pages.get(record.page)?.actor() === record.actor &&
    phase() === record.phase &&
    record.page.url() === record.documentUrl;
  const proof = (record: Candidate): Promise<Proof> => {
    const task = new Promise<Proof>((resolve) => {
      let settled = false;
      const finish = (result: Proof) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stops.delete(cancel);
        record.page.off('close', cancel);
        if (!stopped) {
          if (result === 'UNAVAILABLE') unavailable++;
          if (result === 'DECODED' || result === 'RETIRED') {
            expected++;
            if (result === 'DECODED') decoded++;
            else retired++;
          }
        }
        resolve(result);
      };
      const cancel = () => {
        finish('UNAVAILABLE');
      };
      const timer = setTimeout(cancel, 15_000);
      stops.add(cancel);
      record.page.on('close', cancel);
      if (!current(record)) {
        cancel();
        return;
      }
      // Observe both continuations immediately, including evaluation rejection after timeout/disposal.
      void Promise.resolve()
        .then(() =>
          current(record)
            ? record.page.evaluate(readFunctionalImageProof, {
                origin,
                pathname: record.pathname,
                documentUrl: record.documentUrl,
                approved,
              })
            : { result: 'UNAVAILABLE' },
        )
        .then((raw) => {
          const parsed = proofSchema.safeParse(raw);
          finish(
            current(record) && parsed.success
              ? parsed.data.result
              : 'UNAVAILABLE',
          );
        })
        .catch(cancel);
    });
    pending.add(task);
    void task.then(() => {
      pending.delete(task);
    });
    return task;
  };
  return {
    register(page: Page, actor: () => string | null) {
      if (!allowed.size || pages.has(page)) return;
      const state = { actor, generation: 0, stop: () => undefined };
      const navigated = (frame: ReturnType<Page['mainFrame']>) => {
        if (frame === page.mainFrame()) state.generation++;
      };
      page.on('framenavigated', navigated);
      state.stop = () => {
        page.off('framenavigated', navigated);
      };
      pages.set(page, state);
    },
    request(page: Page, key: string, raw: unknown) {
      if (stopped || !allowed.size) return;
      // Keep tombstones even for noncandidates so reused requestIds never gain provenance.
      if (seen.has(key)) {
        records.delete(key);
        return;
      }
      if (seen.size >= 2000) {
        unavailable++;
        return;
      }
      seen.add(key);
      const parsed = requestSchema.safeParse(raw);
      const owner = pages.get(page);
      const actor = owner?.actor();
      const stage = phase();
      if (
        !parsed.success ||
        !owner ||
        !actor ||
        !['T1', 'T2', 'S1', 'S2', 'A1', 'R1'].includes(actor) ||
        !stage ||
        !(stage in requiredProofs)
      )
        return;
      const event = parsed.data;
      try {
        const url = new URL(event.request.url);
        const documentUrl = new URL(event.documentURL);
        if (
          url.origin !== origin ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !allowed.has(url.pathname) ||
          documentUrl.origin !== origin ||
          documentUrl.username ||
          documentUrl.password ||
          page.url() !== event.documentURL ||
          page.isClosed()
        )
          return;
        records.set(key, {
          page,
          actor,
          phase: stage,
          generation: owner.generation,
          documentUrl: event.documentURL,
          pathname: url.pathname,
          used: false,
          badResponse: false,
        });
      } catch {
        /* No request provenance. */
      }
    },
    response(key: string, raw: unknown) {
      const record = records.get(key);
      if (!record) return;
      const parsed = z
        .object({
          type: z.literal('Image'),
          response: z.object({
            status: z.number().int(),
            mimeType: z.literal('image/webp'),
          }),
        })
        .safeParse(raw);
      if (
        !parsed.success ||
        parsed.data.response.status < 200 ||
        parsed.data.response.status >= 400
      )
        record.badResponse = true;
    },
    failed(page: Page, key: string, raw: unknown): Promise<Proof> | null {
      const record = records.get(key);
      if (record?.page !== page || record.used) return null;
      record.used = true;
      const parsed = z
        .object({
          type: z.literal('Image'),
          errorText: z.literal('net::ERR_ABORTED'),
          canceled: z.literal(true),
        })
        .safeParse(raw);
      if (!parsed.success || record.badResponse || !current(record))
        return null;
      return proof(record);
    },
    available: () => unavailable === 0 && pending.size === 0,
    diagnostics: () => ({
      expectedSupersededImages: expected,
      decodedImageProofs: decoded,
      retiredImageProofs: retired,
      imageProofUnavailable: unavailable,
      pendingImageProofs: pending.size,
    }),
    dispose: async () => {
      if (pending.size) unavailable += pending.size;
      stopped = true;
      for (const state of pages.values()) state.stop();
      for (const stop of [...stops]) stop();
      await Promise.allSettled([...pending]);
    },
  };
};
