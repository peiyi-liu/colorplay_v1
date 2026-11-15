import { z } from 'zod';
import { sha256 } from './local-runtime';
import {
  capacityScopeSchema,
  capacityFailure,
  requireCapacityScope,
  capacityModes,
  type CapacityScope,
  type CapacityMode,
} from './capacity-scope';
export const capacityEngineeringGuards = {
  nodeRssLimitBytes: 2 * 1024 ** 3,
  browserFootprintLimitBytes: 6 * 1024 ** 3,
  sustainedMs: 10000,
  eventLoopP95LimitMs: 200,
  swapIncreaseLimitBytes: 512 * 1024 ** 2,
  hostSampleMaxAgeMs: 3000,
  vmSampleMaxAgeMs: 7000,
  barrierSkewMaxMs: 250,
} as const;
const engineeringGuardsSchema = z.strictObject({
  nodeRssLimitBytes: z.literal(capacityEngineeringGuards.nodeRssLimitBytes),
  browserFootprintLimitBytes: z.literal(
    capacityEngineeringGuards.browserFootprintLimitBytes,
  ),
  sustainedMs: z.literal(10000),
  eventLoopP95LimitMs: z.literal(200),
  swapIncreaseLimitBytes: z.literal(
    capacityEngineeringGuards.swapIncreaseLimitBytes,
  ),
  hostSampleMaxAgeMs: z.literal(3000),
  vmSampleMaxAgeMs: z.literal(7000),
  barrierSkewMaxMs: z.literal(250),
});
export const capacityScenarios = [
  'anonymous_entry_prepare',
  'fresh_registration',
  'existing_login_game',
  'backend_game',
] as const;
export type CapacityScenario = (typeof capacityScenarios)[number];
export const capacityOperations = [
  'published_content',
  'submit_answer',
  'finalize_quiz',
  'leaderboard',
  'teacher_dashboard',
] as const;
export type CapacityOperation = (typeof capacityOperations)[number];
const alias = z
  .string()
  .regex(/^(T1|T2|S1|S2|A1|R1|REG(?:40|60)_(?:0[1-9]|[1-5][0-9]|60))$/u);
const cohort = z.strictObject({
  members: z.array(alias).max(60),
  creation: z.literal('TRUE_UI_OTP_ONLY'),
  priorAuthCount: z.literal(0),
  classAlias: z.enum(['CAPACITY_CLASS_40', 'CAPACITY_CLASS_60']),
});
export const capacityProfileSchema = z.strictObject({
  actors: z.number().int().min(3).max(60),
  students: z.number().int().nonnegative().max(60),
  teachers: z.number().int().nonnegative().max(1),
  anonymous: z.number().int().nonnegative().max(20),
  browserContexts: z.number().int().nonnegative().max(60),
  sdkActors: z.number().int().nonnegative().max(60),
  outsiderActors: z.number().int().min(0).max(1),
  outsiderBrowserContexts: z.literal(0),
  outsiderSdkActors: z.number().int().min(0).max(1),
});
export const capacityLegSchema = z.strictObject({
  legId: z
    .string()
    .regex(
      /^(anonymous_entry_prepare|fresh_registration|existing_login_game|backend_game)-(native_browser|node_protocol|hybrid_browser_sdk)-(3|10|20|40|60)$/u,
    ),
  scenario: z.enum(capacityScenarios),
  mode: z.enum(capacityModes),
  actors: z.number().int().min(3).max(60),
  profile: capacityProfileSchema,
  members: z.array(alias).max(60),
  predecessorLegId: z.string().nullable(),
  requiredOperations: z.array(z.enum(capacityOperations)).max(5),
  teacherReadScheduling: z.enum([
    'NOT_APPLICABLE',
    'DURING_STUDENT_BUSINESS_LOAD',
  ]),
  barriers: z.array(z.enum(['entry', 'submit', 'backend'])).max(2),
});
export type CapacityLeg = z.infer<typeof capacityLegSchema>;
export const capacityManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scope: capacityScopeSchema,
  engineeringGuards: engineeringGuardsSchema,
  identities: z.array(alias).length(106),
  retention: z.literal('ALL_OWNED_AUTH_PROFILE_LEDGER_MEDIA_AUDIT_RETAINED'),
  cohorts: z.strictObject({ registration40: cohort, registration60: cohort }),
  gamePrefix: z.array(alias).length(60),
  outsider: z.literal('R1'),
  backendModes: z
    .array(z.enum(['NODE_PROTOCOL', 'HYBRID_BROWSER_SDK']))
    .min(1)
    .max(2),
  legs: z.array(capacityLegSchema).min(15).max(20),
  noAutomaticRerun: z.literal(true),
  noStagger: z.literal(true),
  noQuotaOverride: z.literal(true),
  noFakeIp: z.literal(true),
});
export type CapacityManifest = z.infer<typeof capacityManifestSchema>;
const members = (n: 40 | 60) =>
  Array.from(
    { length: n },
    (_, i) => `REG${String(n)}_${String(i + 1).padStart(2, '0')}`,
  );
export const createCapacityManifest = (
  scope: CapacityScope,
  backendModes: ('NODE_PROTOCOL' | 'HYBRID_BROWSER_SDK')[] = ['NODE_PROTOCOL'],
): CapacityManifest => {
  requireCapacityScope(scope);
  if (
    new Set(backendModes).size !== backendModes.length ||
    backendModes.length < 1 ||
    backendModes.length > 2
  )
    return capacityFailure();
  const reg40 = members(40),
    reg60 = members(60),
    game = ['T1', ...reg60.slice(0, 59)];
  const legs: CapacityLeg[] = [];
  const chain = (
    scenario: CapacityScenario,
    mode: CapacityMode,
    sizes: number[],
  ) => {
    let predecessorLegId: string | null = null;
    for (const actors of sizes) {
      const anonymous = scenario === 'anonymous_entry_prepare',
        registration = scenario === 'fresh_registration',
        gameplay = !anonymous && !registration;
      const legId = `${scenario}-${mode.toLowerCase()}-${String(actors)}`;
      const browserContexts =
        mode === 'NODE_PROTOCOL'
          ? 0
          : mode === 'HYBRID_BROWSER_SDK'
            ? 3
            : actors;
      legs.push(
        capacityLegSchema.parse({
          legId,
          scenario,
          mode,
          actors,
          profile: {
            actors,
            students: anonymous ? 0 : registration ? actors : actors - 1,
            teachers: gameplay ? 1 : 0,
            anonymous: anonymous ? actors : 0,
            browserContexts,
            sdkActors: actors - browserContexts,
            outsiderActors: gameplay ? 1 : 0,
            outsiderBrowserContexts: 0,
            outsiderSdkActors: gameplay ? 1 : 0,
          },
          members: anonymous
            ? []
            : registration
              ? actors === 40
                ? reg40
                : reg60
              : game.slice(0, actors),
          predecessorLegId,
          requiredOperations: anonymous
            ? []
            : registration
              ? ['published_content']
              : [...capacityOperations],
          teacherReadScheduling: gameplay
            ? 'DURING_STUDENT_BUSINESS_LOAD'
            : 'NOT_APPLICABLE',
          barriers:
            scenario === 'backend_game'
              ? ['backend']
              : anonymous
                ? ['entry']
                : ['entry', 'submit'],
        }),
      );
      predecessorLegId = legId;
    }
  };
  chain('anonymous_entry_prepare', 'NATIVE_BROWSER', [3, 10, 20]);
  chain('fresh_registration', 'NATIVE_BROWSER', [40, 60]);
  chain('existing_login_game', 'NATIVE_BROWSER', [3, 10, 20, 40, 60]);
  for (const mode of backendModes)
    chain('backend_game', mode, [3, 10, 20, 40, 60]);
  return capacityManifestSchema.parse({
    schemaVersion: 1,
    scope,
    engineeringGuards: capacityEngineeringGuards,
    identities: ['T1', 'T2', 'S1', 'S2', 'A1', 'R1', ...reg40, ...reg60],
    retention: 'ALL_OWNED_AUTH_PROFILE_LEDGER_MEDIA_AUDIT_RETAINED',
    cohorts: {
      registration40: {
        members: reg40,
        creation: 'TRUE_UI_OTP_ONLY',
        priorAuthCount: 0,
        classAlias: 'CAPACITY_CLASS_40',
      },
      registration60: {
        members: reg60,
        creation: 'TRUE_UI_OTP_ONLY',
        priorAuthCount: 0,
        classAlias: 'CAPACITY_CLASS_60',
      },
    },
    gamePrefix: game,
    outsider: 'R1',
    backendModes,
    legs,
    noAutomaticRerun: true,
    noStagger: true,
    noQuotaOverride: true,
    noFakeIp: true,
  });
};
export const validateCapacityManifest = (
  input: unknown,
  scope: CapacityScope,
): CapacityManifest => {
  try {
    const parsed = capacityManifestSchema.parse(input);
    const expected = createCapacityManifest(scope, parsed.backendModes);
    if (JSON.stringify(parsed) !== JSON.stringify(expected))
      return capacityFailure();
    return parsed;
  } catch {
    return capacityFailure();
  }
};
export const capacityManifestHash = (plan: CapacityManifest) =>
  sha256(JSON.stringify(capacityManifestSchema.parse(plan)));
export const assertFreshCohort = (
  plan: CapacityManifest,
  size: 40 | 60,
  existingAliases: readonly unknown[],
  scope: CapacityScope,
) => {
  const parsed = validateCapacityManifest(plan, scope);
  const expected =
    parsed.cohorts[size === 40 ? 'registration40' : 'registration60'].members;
  if (
    existingAliases.some(
      (value) =>
        typeof value !== 'string' || !parsed.identities.includes(value),
    )
  )
    return capacityFailure();
  if (new Set(existingAliases).size !== existingAliases.length)
    return capacityFailure();
  if (
    existingAliases.some((value) => typeof value !== 'string') ||
    existingAliases.some((value) => expected.includes(String(value)))
  )
    return capacityFailure();
};
export const findCapacityLeg = (plan: CapacityManifest, legId: string) =>
  plan.legs.find((leg) => leg.legId === legId) ?? capacityFailure();
