import { describe, expect, it } from 'vitest';
import { teacherOperationOutcome } from './teacher-operation-outcome';
import type { TeacherOperationStatusResult } from './teacher-account-contract';
import { adminStepLabel } from '../lib/admin-labels';
const status: TeacherOperationStatusResult = {
  outcome: 'ok',
  requestId: '11111111-1111-4111-8111-111111111111',
  operationId: null,
  operationType: 'create_teacher_account',
  teacherId: null,
  loginAccount: null,
  state: 'completed',
  legalFollowUp: 'none',
};
describe('teacher status reconciliation', () => {
  it('releases the unknown status when the server confirms completed or compensated', () => {
    expect(teacherOperationOutcome(status).kind).toBe('completed');
    expect(
      teacherOperationOutcome({ ...status, state: 'compensated' }),
    ).toMatchObject({ kind: 'denied', message: '已補償，操作未完成。' });
  });
  it('shows integer backend saga steps and does not echo malformed state', () => {
    expect(adminStepLabel(2)).toBe('步驟 2');
    expect(adminStepLabel({ password: 'SECRET' })).not.toContain('SECRET');
  });
});
