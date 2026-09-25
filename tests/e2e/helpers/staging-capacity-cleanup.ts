import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../src/types/database';
import {
  buildStudentAccountPlan,
  CapacityHarnessError,
  findSyntheticAccountRows,
  managementQuery,
  type CapacityAccount,
  type CapacityConfig,
  type CreatedResources,
} from './staging-capacity';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const fail = (code: string): never => {
  throw new CapacityHarnessError(code);
};

const sqlUuid = (value: string): string => {
  if (!UUID_PATTERN.test(value)) return fail('CAPACITY_CLEANUP_TARGET_INVALID');
  return `'${value}'::uuid`;
};

const sqlText = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export function buildCleanupSql(
  accounts: readonly CapacityAccount[],
  teacherId: string | undefined,
  resources: Readonly<CreatedResources>,
): string {
  const userIds = accounts.map((account) => sqlUuid(account.id)).join(', ');
  const fixedTeacherId = teacherId ? sqlUuid(teacherId) : undefined;
  const resourceCleanup = fixedTeacherId
    ? (() => {
        const classroomPredicates = [
          resources.classroomId
            ? `classroom.id = ${sqlUuid(resources.classroomId)}`
            : undefined,
          resources.classroomName
            ? `classroom.name = ${sqlText(resources.classroomName)}`
            : undefined,
        ].filter((predicate): predicate is string => predicate !== undefined);
        const classroomPredicate =
          classroomPredicates.length === 0
            ? 'false'
            : classroomPredicates.join(' and ');
        const exactSessionPredicate = resources.sessionId
          ? ` or live_session.id = ${sqlUuid(resources.sessionId)}`
          : '';
        const exactActivityPredicate = resources.activityId
          ? ` or activity.id = ${sqlUuid(resources.activityId)}`
          : '';
        return `create temporary table capacity_target_sessions on commit drop as
select live_session.id, live_session.live_activity_id
  from public.live_sessions as live_session
  left join public.classrooms as classroom
    on classroom.id = live_session.classroom_id
 where live_session.host_teacher_id = ${fixedTeacherId}
   and ((${classroomPredicate} and classroom.owner_teacher_id = ${fixedTeacherId})${exactSessionPredicate});
delete from public.live_sessions as live_session
 using capacity_target_sessions as target
 where live_session.id = target.id;
delete from public.live_activities as activity
 where activity.owner_teacher_id = ${fixedTeacherId}
   and (activity.id in (
          select target.live_activity_id from capacity_target_sessions as target
        )${exactActivityPredicate});
delete from public.classrooms as classroom
 where classroom.owner_teacher_id = ${fixedTeacherId}
   and ${classroomPredicate};`;
      })()
    : '';
  const deleteIdentityLimiters =
    accounts.length === 0
      ? ''
      : `delete from public.classroom_join_rate_limits
where scope = 'identity'
  and subject_hash in (
    select encode(extensions.digest(id::text, 'sha256'), 'hex')
    from unnest(array[${userIds}]) as ids(id)
  );`;
  return `begin;
set local lock_timeout = '5s';
${resourceCleanup}
${deleteIdentityLimiters}
commit;`;
}

export function buildCleanupVerificationSql(
  runId: string,
  accounts: readonly CapacityAccount[],
  teacherId: string | undefined,
  resources: Readonly<CreatedResources>,
): string {
  const userIds = accounts.map((account) => sqlUuid(account.id)).join(', ');
  const plannedEmails = buildStudentAccountPlan(runId)
    .map((account) => sqlText(account.email.toLowerCase()))
    .join(', ');
  const fixedTeacherId = teacherId ? sqlUuid(teacherId) : undefined;
  const classroomPredicates = [
    resources.classroomId
      ? `classroom.id = ${sqlUuid(resources.classroomId)}`
      : undefined,
    resources.classroomName
      ? `classroom.name = ${sqlText(resources.classroomName)}`
      : undefined,
  ].filter((predicate): predicate is string => predicate !== undefined);
  const classroomPredicate =
    classroomPredicates.length === 0
      ? 'false'
      : classroomPredicates.join(' and ');
  const sessionPredicate = resources.sessionId
    ? `live_session.id = ${sqlUuid(resources.sessionId)}`
    : `exists (
         select 1 from public.classrooms as classroom
          where classroom.id = live_session.classroom_id
            and classroom.owner_teacher_id = ${fixedTeacherId ?? 'null'}
            and ${classroomPredicate}
       )`;
  const activityPredicate = resources.activityId
    ? `activity.id = ${sqlUuid(resources.activityId)}`
    : 'false';
  const identityLimitersRemaining =
    accounts.length === 0
      ? '0'
      : `(select count(*)::int
            from public.classroom_join_rate_limits
           where scope = 'identity'
             and subject_hash in (
               select encode(extensions.digest(id::text, 'sha256'), 'hex')
                 from unnest(array[${userIds}]) as ids(id)
             ))`;
  const profilesRemaining =
    accounts.length === 0
      ? '0'
      : `(select count(*)::int
            from public.profiles
           where id = any(array[${userIds}]))`;
  const classroomsRemaining = fixedTeacherId
    ? `(select count(*)::int
         from public.classrooms as classroom
        where classroom.owner_teacher_id = ${fixedTeacherId}
          and ${classroomPredicate})`
    : '0';
  const activitiesRemaining = fixedTeacherId
    ? `(select count(*)::int
         from public.live_activities as activity
        where activity.owner_teacher_id = ${fixedTeacherId}
          and ${activityPredicate})`
    : '0';
  const sessionsRemaining = fixedTeacherId
    ? `(select count(*)::int
         from public.live_sessions as live_session
        where live_session.host_teacher_id = ${fixedTeacherId}
          and ${sessionPredicate})`
    : '0';
  return `select
  (select count(*)::int
     from auth.users
    where lower(email) = any(array[${plannedEmails}])
       or raw_user_meta_data ->> 'capacity_run_id' = ${sqlText(runId)}) as auth_users_remaining,
  ${profilesRemaining} as profiles_remaining,
  ${classroomsRemaining} as classrooms_remaining,
  ${activitiesRemaining} as live_activities_remaining,
  ${sessionsRemaining} as live_sessions_remaining,
  ${identityLimitersRemaining} as identity_limiters_remaining;`;
}

export async function assertNoClassroomCollision(
  config: CapacityConfig,
  teacherId: string,
  classroomName: string,
  signal?: AbortSignal,
) {
  const rows = await managementQuery(
    config,
    `select count(*)::int as collision_count
       from public.classrooms
      where owner_teacher_id = ${sqlUuid(teacherId)}
        and name = ${sqlText(classroomName)};`,
    signal,
  );
  if (Number(rows[0]?.collision_count ?? -1) !== 0) {
    fail('CAPACITY_CLASSROOM_COLLISION');
  }
}

export async function cleanupSyntheticRun(
  config: CapacityConfig,
  service: SupabaseClient<Database>,
  accounts: readonly CapacityAccount[],
  teacherId: string | undefined,
  resources: Readonly<CreatedResources>,
  signal?: AbortSignal,
): Promise<Readonly<Record<string, number>>> {
  const plan = buildStudentAccountPlan(config.runId);
  const discoveredRows = await findSyntheticAccountRows(
    config,
    config.runId,
    undefined,
    signal,
  );
  const discovered = discoveredRows.flatMap((row) => {
    const fixture = plan.find((entry) => entry.email === row.email);
    if (
      fixture === undefined ||
      typeof row.id !== 'string' ||
      row.capacity_run_id !== config.runId ||
      row.capacity_account !== fixture.account
    ) {
      return [];
    }
    return [{ ...fixture, id: row.id }];
  });
  const exactAccounts = [...accounts, ...discovered].filter(
    (account, index, values) =>
      values.findIndex((candidate) => candidate.id === account.id) === index,
  );
  let databaseCleanupFailed = false;
  try {
    await managementQuery(
      config,
      buildCleanupSql(exactAccounts, teacherId, resources),
      signal,
    );
  } catch {
    databaseCleanupFailed = true;
  }
  let authCleanupFailed = false;
  for (const account of [...exactAccounts].reverse()) {
    signal?.throwIfAborted();
    const { error } = await service.auth.admin.deleteUser(account.id);
    if (error) authCleanupFailed = true;
  }
  if (databaseCleanupFailed) fail('CAPACITY_DATABASE_CLEANUP_FAILED');
  if (authCleanupFailed) fail('CAPACITY_AUTH_CLEANUP_FAILED');
  const [verification] = await managementQuery(
    config,
    buildCleanupVerificationSql(
      config.runId,
      exactAccounts,
      teacherId,
      resources,
    ),
    signal,
  );
  if (verification === undefined) {
    throw new CapacityHarnessError('CAPACITY_CLEANUP_VERIFY_FAILED');
  }
  const result = Object.fromEntries(
    Object.entries(verification).map(([key, value]) => [key, Number(value)]),
  );
  if (Object.values(result).some((value) => value !== 0)) {
    fail('CAPACITY_CLEANUP_INCOMPLETE');
  }
  return result;
}
