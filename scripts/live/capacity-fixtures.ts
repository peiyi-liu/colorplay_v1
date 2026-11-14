import { randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import {
  buildStudentAccountPlan,
  type CapacityAccount,
  type CapacityCredentials,
  type CreatedResources,
} from '../../tests/e2e/helpers/staging-capacity';
import {
  buildCleanupSql,
  buildCleanupVerificationSql,
} from '../../tests/e2e/helpers/staging-capacity-cleanup';
import { failCapacity, type CapacityConfig } from './capacity-config';
import {
  createLocalClient,
  type CapacitySecrets,
} from './capacity-local-client';
import type { LocalDatabase, LocalQueryRow } from './capacity-local-database';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const text = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const sqlUuid = (value: string) =>
  UUID.test(value)
    ? `'${value}'::uuid`
    : failCapacity('LIVE_CAPACITY_FIXTURE_ID_INVALID');
export const buildLocalFixturePlan = (
  config: Pick<CapacityConfig, 'runId' | 'totalActors'>,
) => {
  const participants = buildStudentAccountPlan(config.runId).slice(
    0,
    config.totalActors - 1,
  );
  const base = buildStudentAccountPlan(`${config.runId}x`)[0];
  if (!base) return failCapacity('LIVE_CAPACITY_FIXTURE_PLAN_INVALID');
  const outsider: CapacityCredentials = {
    ...base,
    displayName: '容量隔離學生',
    password: `A${randomBytes(8).toString('hex')}z1`,
  };
  return { participants, outsider, all: [...participants, outsider] };
};
export const matchOwnedFixtureRows = (
  rows: readonly LocalQueryRow[],
  plan: readonly CapacityCredentials[],
  runId: string,
): CapacityAccount[] =>
  rows.flatMap((row) => {
    const fixture = plan.find(
      (candidate) =>
        candidate.email === row.email &&
        candidate.account === row.capacity_account,
    );
    return fixture &&
      row.capacity_run_id === runId &&
      typeof row.id === 'string' &&
      UUID.test(row.id)
      ? [{ ...fixture, id: row.id }]
      : [];
  });

export const createCapacityFixtures = (
  config: CapacityConfig,
  secrets: CapacitySecrets,
  database: LocalDatabase,
  runSignal: AbortSignal,
) => {
  const plan = buildLocalFixturePlan(config);
  const accounts: CapacityAccount[] = [];
  const resources: CreatedResources = {};
  const classroomName = `少設備容量 ${config.runId}`;
  const activityTitle = `少設備容量 ${config.runId}`;
  let accountsStarted = false;
  let activityStarted = false;
  let teacherId: string | undefined;
  const service = createLocalClient(config, secrets.serviceKey, runSignal);
  const discover = (signal: AbortSignal) =>
    database.rows(
      `select id::text, lower(email) as email, raw_user_meta_data ->> 'capacity_run_id' as capacity_run_id, raw_user_meta_data ->> 'capacity_account' as capacity_account from auth.users where lower(email) = any(array[${[...buildStudentAccountPlan(config.runId), plan.outsider].map((fixture) => text(fixture.email)).join(',')}]) or raw_user_meta_data ->> 'capacity_run_id' = ${text(config.runId)}`,
      signal,
    );

  return {
    plan,
    accounts,
    resources,
    createAccounts: async () => {
      if ((await discover(runSignal)).length !== 0)
        return failCapacity('LIVE_CAPACITY_ACCOUNT_COLLISION');
      accountsStarted = true;
      for (const fixture of plan.all) {
        runSignal.throwIfAborted();
        // Metadata is written in the same Auth creation, so an unknown commit
        // can be reconciled even when no response or ID reached this process.
        try {
          await service.auth.admin.createUser({
            email: fixture.email,
            password: fixture.password,
            email_confirm: true,
            user_metadata: {
              capacity_fixture: 'low-device-capacity',
              capacity_run_id: config.runId,
              capacity_account: fixture.account,
            },
          });
        } catch {
          /* Reconcile below; cleanup also discovers an interrupted commit. */
        }
        runSignal.throwIfAborted();
        const owned = matchOwnedFixtureRows(
          await discover(runSignal),
          plan.all,
          config.runId,
        );
        const account = owned.find(
          (candidate) => candidate.email === fixture.email,
        );
        if (!account)
          return failCapacity('LIVE_CAPACITY_ACCOUNT_CREATE_FAILED');
        if (!accounts.some((candidate) => candidate.id === account.id))
          accounts.push(account);
        const { data, error } = await service
          .from('profiles')
          .update({
            display_name: fixture.displayName,
            full_name: fixture.displayName,
            login_account: fixture.account,
          })
          .eq('id', account.id)
          .select('id, role, login_account')
          .single();
        if (
          error ||
          data.role !== 'student' ||
          data.login_account !== fixture.account
        )
          return failCapacity('LIVE_CAPACITY_PROFILE_SETUP_FAILED');
      }
    },
    verifyTeacher: async (id: string) => {
      const { data, error } = await service
        .from('profiles')
        .select('id, role, login_account')
        .eq('id', id)
        .single();
      if (
        error ||
        data.role !== 'teacher' ||
        data.login_account !== 'teacher01'
      )
        return failCapacity('LIVE_CAPACITY_TEACHER_PREFLIGHT_FAILED');
      teacherId = id;
      const collision = await database.rows(
        `select id::text from public.classrooms where owner_teacher_id = ${sqlUuid(id)} and name = ${text(classroomName)} union all select id::text from public.live_activities where owner_teacher_id = ${sqlUuid(id)} and title = ${text(activityTitle)}`,
        runSignal,
      );
      if (collision.length !== 0)
        return failCapacity('LIVE_CAPACITY_RESOURCE_COLLISION');
    },
    createClassroom: async (host: SupabaseClient<Database>) => {
      if (!teacherId)
        return failCapacity('LIVE_CAPACITY_TEACHER_PREFLIGHT_FAILED');
      resources.classroomName = classroomName;
      const classroom = await createClassroomRepository(host).createClassroom({
        name: classroomName,
      });
      resources.classroomId = classroom.classroomId;
      return classroom;
    },
    launchLive: async (host: SupabaseClient<Database>) => {
      if (!teacherId || !resources.classroomId)
        return failCapacity('LIVE_CAPACITY_RESOURCE_MISSING');
      const repository = createLiveRepository(host);
      const option = (await repository.listSectionOptions())[0];
      if (!option) return failCapacity('LIVE_CAPACITY_CONTENT_UNAVAILABLE');
      activityStarted = true;
      const activity = await repository.createActivity({
        title: activityTitle,
        quizTemplateId: option.quizTemplateId,
        sectionId: option.sectionId,
        questionTimeLimitSeconds: 20,
        questionDisplay: 'device',
      });
      resources.activityId = activity.activityId;
      const session = await repository.createSession({
        activityId: activity.activityId,
        classroomId: resources.classroomId,
        assignmentId: null,
      });
      resources.sessionId = session.sessionId;
      await repository.startSession(session.sessionId, session.stateVersion);
      const state = await repository.getState(session.sessionId);
      if (state.state !== 'lobby' || state.questionCount < 3)
        return failCapacity('LIVE_CAPACITY_CONTENT_UNAVAILABLE');
      return { ...session, stateVersion: state.stateVersion };
    },
    verifyRound: async (position: number) => {
      if (!resources.sessionId)
        return failCapacity('LIVE_CAPACITY_RESOURCE_MISSING');
      const rows = await database.rows(
        `select count(*)::int as answer_count, count(distinct answer.participant_id)::int as participant_count from public.live_answers as answer join public.live_session_questions as question on question.id = answer.session_question_id where question.session_id = ${sqlUuid(resources.sessionId)} and question.position = ${String(position)}`,
        runSignal,
      );
      const row = rows[0];
      return {
        answerCount: Number(row?.answer_count ?? -1),
        distinctParticipants: Number(row?.participant_count ?? -1),
      };
    },
    cleanup: async (cleanupSignal: AbortSignal) => {
      // A prior collision is not this run's ownership. Never delete it.
      const owned = accountsStarted
        ? matchOwnedFixtureRows(
            await discover(cleanupSignal),
            plan.all,
            config.runId,
          )
        : [];
      const cleanupService = createLocalClient(
        config,
        secrets.serviceKey,
        cleanupSignal,
      );
      if (teacherId && activityStarted && !resources.activityId) {
        const activities = await database.rows(
          `select id::text from public.live_activities where owner_teacher_id = ${sqlUuid(teacherId)} and title = ${text(activityTitle)}`,
          cleanupSignal,
        );
        if (activities.length > 1)
          return failCapacity('LIVE_CAPACITY_CLEANUP_OWNERSHIP_AMBIGUOUS');
        const activityId = activities[0]?.id;
        if (typeof activityId === 'string') resources.activityId = activityId;
      }
      await database.execute(
        buildCleanupSql(owned, teacherId, resources),
        cleanupSignal,
      );
      let deletionFailed = false;
      for (const account of [...owned].reverse()) {
        cleanupSignal.throwIfAborted();
        const { error } = await cleanupService.auth.admin.deleteUser(
          account.id,
        );
        if (error) deletionFailed = true;
      }
      if (deletionFailed)
        return failCapacity('LIVE_CAPACITY_AUTH_CLEANUP_FAILED');
      const [verification] = await database.rows(
        buildCleanupVerificationSql(config.runId, owned, teacherId, resources),
        cleanupSignal,
      );
      if (
        !verification ||
        Object.values(verification).some((value) => Number(value) !== 0)
      )
        return failCapacity('LIVE_CAPACITY_CLEANUP_INCOMPLETE');
      return Object.fromEntries(
        Object.entries(verification).map(([key, value]) => [
          key,
          Number(value),
        ]),
      );
    },
  };
};
