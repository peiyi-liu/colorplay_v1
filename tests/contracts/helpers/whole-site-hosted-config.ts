import { createHash } from 'node:crypto';
export const hash = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export const setup = () => {
  const request = {
    environment: 'staging',
    projectRef: 'onkxnkzeixpezetkmocf',
    supabaseOrigin: 'https://onkxnkzeixpezetkmocf.supabase.co',
    appOrigin: 'https://staging.colorplayapp.com',
    sourceRevision: 'a'.repeat(40),
    webRevision: 'a'.repeat(40),
    fingerprints: {
      artifactSha256: 'b'.repeat(64),
      publicKeySha256: 'c'.repeat(64),
      serviceKeySha256: 'd'.repeat(64),
    },
    runId: 'wsh-synthetic-run',
    planId: 'wshp-synthetic-plan',
    fixtureMarker: 'wsh-synthetic-marker',
    scenario: 'existing_login_game',
    measuredCount: 3,
    actors: [
      { alias: 'T1', role: 'teacher' },
      { alias: 'S1', role: 'student' },
      { alias: 'S2', role: 'student' },
    ],
    registrationCoordinator: null,
    outsider: { alias: 'O1', role: 'student' },
    plannedNewIdentities: 0,
    cumulativeFixtureCount: 4,
  };
  const predecessor = {
    candidateRevision: request.sourceRevision,
    localFunctionalResultSha256: '1'.repeat(64),
    localFunctionalCloseSha256: '2'.repeat(64),
    localCapacityManifestSha256: '3'.repeat(64),
    localCapacityChainSha256: '4'.repeat(64),
  };
  const run = {
    runId: request.runId,
    planId: request.planId,
    fixtureMarker: request.fixtureMarker,
    nonceSha256: '5'.repeat(64),
  };
  const approval = {
    schemaVersion: 1,
    kind: 'ROOT_HOSTED_APPROVAL',
    scope: request,
    window: {
      notBefore: '2026-11-15T10:00:00Z',
      expiresAt: '2026-11-15T11:00:00Z',
    },
    dataPolicy: {
      immutableRetention: 'RETAIN_LEDGER_MEDIA_AUDIT',
      maxRetainedIdentities: 4,
      cleanup: [
        { category: 'owned_browser_contexts', maximumCount: 3 },
        { category: 'private_credential_temps', maximumCount: 4 },
      ],
    },
    mail: null,
    predecessor,
    sourceProof: { kind: 'SAME_SHA' },
    rootRun: run,
  };
  const trusted = {
    approvalBytes: JSON.stringify(approval),
    expectedApprovalSha256: '',
    nowUtc: '2026-11-15T10:30:00Z',
    sourceProof: null,
    observed: {
      environment: request.environment,
      projectRef: request.projectRef,
      supabaseOrigin: request.supabaseOrigin,
      appOrigin: request.appOrigin,
      sourceRevision: request.sourceRevision,
      webRevision: request.webRevision,
      fingerprints: request.fingerprints,
      observedAtUtc: '2026-11-15T10:20:00Z',
    },
    predecessorAuthorization: {
      ...predecessor,
      checkedAtUtc: '2026-11-14T10:00:00Z',
    },
    runIdentity: { ...run, state: 'UNUSED' },
    controlledMail: null,
  };
  const pin = () => {
    trusted.approvalBytes = JSON.stringify(approval);
    trusted.expectedApprovalSha256 = hash(trusted.approvalBytes);
  };
  pin();
  return { request, approval, trusted, pin };
};
export const scenarioFixture = (
  scenario:
    | 'anonymous_entry_prepare'
    | 'fresh_registration'
    | 'existing_login_game'
    | 'backend_game',
  count: 3 | 10 | 20 | 40 | 60,
) => {
  const h = setup();
  const anonymous = scenario === 'anonymous_entry_prepare';
  const fresh = scenario === 'fresh_registration';
  const request = {
    ...h.request,
    scenario,
    measuredCount: count,
    actors: Array.from({ length: count }, (_, i) => ({
      alias: `A${String(i)}`,
      role: anonymous ? 'anonymous' : !fresh && i === 0 ? 'teacher' : 'student',
    })),
    registrationCoordinator: fresh
      ? { alias: 'COORDINATOR', role: 'teacher' }
      : null,
    outsider: anonymous ? null : { alias: 'OUTSIDER', role: 'student' },
    plannedNewIdentities: fresh ? count : 0,
    cumulativeFixtureCount: anonymous ? 0 : count + (fresh ? 2 : 1),
  };
  const mail = fresh
    ? {
        capability: 'REAL_MAIL_CONTROLLED_INBOX',
        controlledInboxSha256: '6'.repeat(64),
        sendPermission: 'OWNER_APPROVED',
      }
    : null;
  const approval = {
    ...h.approval,
    scope: request,
    mail,
    dataPolicy: {
      ...h.approval.dataPolicy,
      maxRetainedIdentities: request.cumulativeFixtureCount,
    },
  };
  const trusted = {
    ...h.trusted,
    controlledMail: mail
      ? { ...mail, checkedAtUtc: '2026-11-15T10:20:00Z' }
      : null,
  };
  const pin = () => {
    trusted.approvalBytes = JSON.stringify(approval);
    trusted.expectedApprovalSha256 = hash(trusted.approvalBytes);
  };
  pin();
  return { request, approval, trusted, pin };
};
