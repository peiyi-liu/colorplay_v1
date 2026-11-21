import type { ConsoleMessage, Page, Response } from '@playwright/test';
import { z } from 'zod';
import { isExactLocalLogout } from './capacity-onboarding-logout';
const resource =
  'Failed to load resource: the server responded with a status of 403 (Forbidden)';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const capacityConsoleDiagnosticsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal('NON_AUTHORITY'),
  collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNAVAILABLE']),
  sealed: z.boolean(),
  rawConsole: count,
  rawPage: count,
  rawServer: count,
  provenMatched: count.max(60),
  unmatchedConsole: count,
  observedActors: count.max(60),
  unavailableActors: count.max(60),
  unobservedActors: count.max(60),
  pwCandidateActors: count.max(60),
  networkLogActors: count.max(60),
  requestMatchedActors: count.max(60),
  proofEligibleActors: count.max(60),
});
const proofs = new WeakMap<
  object,
  {
    message: ConsoleMessage;
    current(): boolean;
  }
>();
const logSchema = z.object({
  entry: z.object({
    level: z.string(),
    source: z.string(),
    text: z.string().max(4096),
    url: z.string().max(4096).optional(),
    networkRequestId: z.string().max(200).optional(),
  }),
});
export const createOnboardingConsolePairing = (
  origin: string,
  readExistingDiscount: () => boolean,
) => {
  let id: string | null = null,
    generation: number | null = null,
    enabled = false,
    disposed = false,
    unavailable = false,
    requests = 0,
    logs = 0,
    messages = 0,
    message: ConsoleMessage | null = null,
    requestMatched = false;
  const exact = (url: string) => url === origin + '/auth/v1/logout?scope=local';
  const current = () =>
    !unavailable &&
    !disposed &&
    enabled &&
    requests === 1 &&
    logs === 1 &&
    messages === 1 &&
    readExistingDiscount();
  return {
    enabled() {
      enabled = true;
    },
    unavailable() {
      unavailable = true;
    },
    arm(phase: string, value: number) {
      if (phase === 'registration_complete') {
        if (generation !== null) unavailable = true;
        else generation = value;
      }
    },
    request(requestId: string, url: string, method: string, value: number) {
      if (requestId === id) unavailable = true;
      if (!isExactLocalLogout(url, method, origin)) return;
      requests++;
      if (disposed || requests !== 1 || generation !== value || !exact(url))
        unavailable = true;
      else id = requestId;
    },
    console: (value: ConsoleMessage) => {
      try {
        if (
          value.type() !== 'error' ||
          value.text() !== resource ||
          value.args().length !== 0
        )
          return;
        const location = value.location();
        if (
          !exact(location.url) ||
          location.lineNumber !== 0 ||
          location.columnNumber !== 0
        )
          return;
        messages++;
        if (disposed || messages !== 1) unavailable = true;
        else message = value;
      } catch {
        unavailable = true;
      }
    },
    log: (raw: unknown) => {
      try {
        const { entry } = logSchema.parse(raw);
        if (
          entry.level !== 'error' ||
          entry.source !== 'network' ||
          !entry.url ||
          !exact(entry.url)
        )
          return;
        logs++;
        requestMatched =
          logs === 1 &&
          entry.text === resource &&
          !!id &&
          entry.networkRequestId === id;
        if (
          disposed ||
          logs !== 1 ||
          entry.text !== resource ||
          !id ||
          entry.networkRequestId !== id
        )
          unavailable = true;
      } catch {
        unavailable = true;
      }
    },
    evidence: () => {
      const collection =
        unavailable || disposed
          ? ('UNAVAILABLE' as const)
          : enabled
            ? ('OBSERVED' as const)
            : ('UNOBSERVED' as const);
      let proof: object | undefined;
      let proofEligible = false;
      try {
        proofEligible = readExistingDiscount();
        if (message && current()) {
          proof = Object.freeze({});
          proofs.set(proof, { message, current });
        }
      } catch {
        unavailable = true;
      }
      return {
        collection: unavailable ? ('UNAVAILABLE' as const) : collection,
        pwCandidate: messages > 0,
        networkLog: logs > 0,
        requestMatched,
        proofEligible,
        proof,
      };
    },
    dispose() {
      disposed = true;
      id = null;
      message = null;
    },
  };
};
export const createCapacityErrorCounts = (
  readOwned: (
    actor: object,
  ) =>
    | ReturnType<ReturnType<typeof createOnboardingConsolePairing>['evidence']>
    | undefined,
) => {
  let rawConsole = 0,
    rawPage = 0,
    rawServer = 0;
  const actors = new Map<object, WeakSet<ConsoleMessage>>();
  const disposers: (() => void)[] = [];
  let sealed: z.infer<typeof capacityConsoleDiagnosticsSchema> | null = null;
  const snapshot = (aggregate: boolean) => {
    let provenMatched = 0,
      observedActors = 0,
      unavailableActors = 0,
      unobservedActors = 0;
    let pwCandidateActors = 0,
      networkLogActors = 0,
      requestMatchedActors = 0,
      proofEligibleActors = 0;
    if (aggregate)
      for (const [actor, seen] of actors) {
        let state: 'OBSERVED' | 'UNAVAILABLE' | 'UNOBSERVED';
        try {
          const evidence = readOwned(actor);
          state = evidence?.collection ?? 'UNOBSERVED';
          if (evidence?.pwCandidate) pwCandidateActors++;
          if (evidence?.networkLog) networkLogActors++;
          if (evidence?.requestMatched) requestMatchedActors++;
          if (evidence?.proofEligible) proofEligibleActors++;
          const proof = evidence?.proof
            ? proofs.get(evidence.proof)
            : undefined;
          if (proof && seen.has(proof.message) && proof.current())
            provenMatched++;
        } catch {
          state = 'UNAVAILABLE';
        }
        if (state === 'OBSERVED') observedActors++;
        else if (state === 'UNAVAILABLE') unavailableActors++;
        else unobservedActors++;
      }
    else unobservedActors = actors.size;
    return capacityConsoleDiagnosticsSchema.parse({
      schemaVersion: 1,
      authority: 'NON_AUTHORITY',
      collection: aggregate
        ? unavailableActors
          ? 'UNAVAILABLE'
          : unobservedActors
            ? 'UNOBSERVED'
            : 'OBSERVED'
        : 'UNOBSERVED',
      sealed: aggregate,
      rawConsole,
      rawPage,
      rawServer,
      provenMatched,
      unmatchedConsole: rawConsole - provenMatched,
      observedActors,
      unavailableActors,
      unobservedActors,
      pwCandidateActors,
      networkLogActors,
      requestMatchedActors,
      proofEligibleActors,
    });
  };
  return {
    track(actor: { page: Page }) {
      const seen = new WeakSet<ConsoleMessage>();
      actors.set(actor, seen);
      const console = (message: ConsoleMessage) => {
          if (message.type() === 'error') {
            rawConsole++;
            seen.add(message);
          }
        },
        error = () => {
          rawPage++;
        },
        response = (value: Response) => {
          if (value.status() >= 500) rawServer++;
        };
      actor.page.on('console', console);
      actor.page.on('pageerror', error);
      actor.page.on('response', response);
      disposers.push(() => {
        actor.page.off('console', console);
        actor.page.off('pageerror', error);
        actor.page.off('response', response);
      });
    },
    aggregate() {
      sealed ??= Object.freeze(snapshot(true));
      return (
        sealed.rawConsole +
        sealed.rawPage +
        sealed.rawServer -
        sealed.provenMatched
      );
    },
    diagnostics: () => sealed ?? snapshot(false),
    dispose() {
      for (const dispose of disposers) dispose();
    },
  };
};
