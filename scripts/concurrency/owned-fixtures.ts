import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import { fail, safely, type FunctionalScope } from './config';
import { requireFunctionalReady } from './local-runtime';
import type { PrivateJournal } from './private-journal';

export const labels = ['T1', 'T2', 'S1', 'S2', 'A1', 'R1'] as const;
export type IdentityLabel = (typeof labels)[number];
export interface FunctionalIdentity {
  label: IdentityLabel;
  account: string;
  email: string;
  password: string;
  replacementPassword: string;
  displayName: string;
  userId: string | null;
}
export type FunctionalIdentities = Record<IdentityLabel, FunctionalIdentity>;
export const planFunctionalIdentities = (
  scope: FunctionalScope,
): FunctionalIdentities =>
  Object.fromEntries(
    labels.map((label) => {
      const account = `wb${randomBytes(8).toString('hex')}`;
      return [
        label,
        {
          label,
          account,
          email: `${scope.runId}.${account}@colorplay.test`,
          password: `Aa1${randomBytes(6).toString('base64url')}`,
          replacementPassword: `Bb2${randomBytes(6).toString('base64url')}`,
          displayName: `驗證${label}${scope.runId.slice(-6)}`,
          userId: null,
        },
      ];
    }),
  ) as FunctionalIdentities;
export interface FixturePorts {
  create: (identity: FunctionalIdentity) => Promise<string>;
  profile: (identity: FunctionalIdentity) => Promise<void>;
  bootstrap: (
    identity: FunctionalIdentity,
    operationId: string,
  ) => Promise<void>;
}
export const provisionFunctionalIdentities = async (
  scope: FunctionalScope,
  journal: PrivateJournal,
  ports: FixturePorts,
  signal: AbortSignal,
) => {
  requireFunctionalReady(scope);
  const plan = planFunctionalIdentities(scope);
  await journal.write('identity-plan', {
    runId: scope.runId,
    identities: plan,
    retention: 'AUTH_PROFILE_IMMUTABLE_LEDGER_MEDIA_AUDIT_RETAINED',
  });
  for (const label of labels.filter((value) => value !== 'R1')) {
    if (signal.aborted) return fail('FUNCTIONAL_ABORTED');
    const identity = plan[label];
    await journal.write(`create-${label.toLowerCase()}-intent`, { identity });
    try {
      identity.userId = z.uuid().parse(await ports.create(identity));
      await journal.write(`create-${label.toLowerCase()}-confirmed`, {
        identity,
      });
      await ports.profile(identity);
      if (label === 'A1') {
        const operationId = randomUUID();
        await journal.write('admin-bootstrap-intent', {
          userId: identity.userId,
          operationId,
        });
        await ports.bootstrap(identity, operationId);
      }
      await journal.write(`setup-${label.toLowerCase()}-confirmed`, {
        userId: identity.userId,
      });
    } catch {
      await journal.write(`setup-${label.toLowerCase()}-unknown`, {
        phase: 'PARTIAL_CREATION_RETAINED',
        userId: identity.userId,
      });
      return fail('FUNCTIONAL_FIXTURE_FAILED');
    }
  }
  return plan;
};
// This is environment setup only. No service-role student gameplay, grant of
// currency, database reset or deletion is exposed by this adapter.
export const functionalFixturePorts = (
  service: SupabaseClient<Database>,
  scope: FunctionalScope,
): FixturePorts => {
  requireFunctionalReady(scope);
  return {
    create: async (identity) => {
      const { data, error } = await service.auth.admin.createUser({
        email: identity.email,
        password: identity.password,
        email_confirm: true,
        user_metadata: {
          whole_site_run_id: scope.runId,
          whole_site_label: identity.label,
        },
      });
      if (
        error ||
        !data.user.id ||
        data.user.email !== identity.email ||
        data.user.user_metadata.whole_site_run_id !== scope.runId ||
        data.user.user_metadata.whole_site_label !== identity.label
      )
        return fail('FUNCTIONAL_FIXTURE_FAILED');
      return data.user.id;
    },
    profile: async (identity) => {
      if (!identity.userId) return fail('FUNCTIONAL_FIXTURE_FAILED');
      const role = identity.label.startsWith('T') ? 'teacher' : 'student';
      const { data, error } = await service
        .from('profiles')
        .update({
          role,
          full_name: identity.displayName,
          display_name: identity.displayName,
          login_account: identity.account,
        })
        .eq('id', identity.userId)
        .select('id, role, login_account')
        .single();
      if (
        error ||
        data.id !== identity.userId ||
        data.role !== role ||
        data.login_account !== identity.account
      )
        return fail('FUNCTIONAL_FIXTURE_FAILED');
    },
    bootstrap: async (identity, operationId) => {
      if (!identity.userId) return fail('FUNCTIONAL_FIXTURE_FAILED');
      const { data, error } = await service.rpc(
        'svc_admin_bootstrap_identity',
        { p_runbook_operation_id: operationId, p_user_id: identity.userId },
      );
      if (
        error ||
        !z.object({ outcome: z.literal('ok') }).safeParse(data).success
      )
        return fail('FUNCTIONAL_FIXTURE_FAILED');
    },
  };
};
export const createFunctionalClassrooms = async (
  teacher1: SupabaseClient<Database>,
  teacher2: SupabaseClient<Database>,
  scope: FunctionalScope,
  journal: PrivateJournal,
) =>
  safely(async () => {
    requireFunctionalReady(scope);
    const receipts = [];
    for (const [index, teacher] of [teacher1, teacher2].entries()) {
      const name = `全站驗證${String(index + 1)} ${scope.runId}`;
      await journal.write(`classroom-${String(index + 1)}-intent`, { name });
      const receipt = await createClassroomRepository(teacher).createClassroom({
        name,
      });
      await journal.write(`classroom-${String(index + 1)}-confirmed`, receipt);
      receipts.push(receipt);
    }
    const [c1, c2] = receipts;
    if (!c1 || !c2 || c1.classroomId === c2.classroomId)
      return fail('FUNCTIONAL_FIXTURE_FAILED');
    return { c1, c2 };
  }, 'FUNCTIONAL_FIXTURE_FAILED');
export const joinFunctionalStudents = async (
  scope: FunctionalScope,
  students: readonly SupabaseClient<Database>[],
  classroom: { classroomId: string; joinCode: string },
  journal: PrivateJournal,
) =>
  safely(async () => {
    requireFunctionalReady(scope);
    for (const [index, student] of students.entries()) {
      const requestId = randomUUID();
      await journal.write(`join-${String(index + 1)}-intent`, {
        classroomId: classroom.classroomId,
        requestId,
      });
      await createClassroomRepository(student).joinClassroom({
        joinCode: classroom.joinCode,
        requestId,
      });
      const membership = await createClassroomRepository(student).listMine();
      if (!membership.some((row) => row.classroomId === classroom.classroomId))
        return fail('FUNCTIONAL_FIXTURE_FAILED');
      await journal.write(`join-${String(index + 1)}-confirmed`, {
        classroomId: classroom.classroomId,
        method: 'EDGE_API_JOIN',
      });
    }
  }, 'FUNCTIONAL_FIXTURE_FAILED');
