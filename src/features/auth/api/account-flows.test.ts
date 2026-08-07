import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  AccountFlowError,
  applyNewPassword,
  completeStudentRegistration,
  requestPasswordReset,
  sendRegistrationOtp,
  verifyRegistrationOtp,
} from './account-flows';

const clientFor = (overrides: { auth?: object; functions?: object }) =>
  ({
    auth: overrides.auth ?? {},
    functions: overrides.functions ?? {},
  }) as unknown as import('@supabase/supabase-js').SupabaseClient<Database>;

const registration = {
  account: ' 11500001 ',
  classCode: ' COLOR-101 ',
  fullName: '王小明',
  nickname: '小明',
  password: 'safe-password',
};

describe('account flows', () => {
  it('sends registration OTPs with account creation explicitly enabled', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });

    await sendRegistrationOtp(
      'student@colorplay.invalid',
      clientFor({ auth: { signInWithOtp } }),
    );

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'student@colorplay.invalid',
      options: { shouldCreateUser: true },
    });
  });

  it('maps OTP send failures and invalid or sessionless verification to stable errors', async () => {
    const signInWithOtp = vi
      .fn()
      .mockResolvedValue({ error: new Error('raw') });
    const verifyOtp = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({
        data: { session: null },
        error: new Error('raw'),
      });
    const client = clientFor({ auth: { signInWithOtp, verifyOtp } });

    await expect(
      sendRegistrationOtp('student@colorplay.invalid', client),
    ).rejects.toEqual(new AccountFlowError('OTP_SEND_FAILED'));
    await expect(
      verifyRegistrationOtp('student@colorplay.invalid', '123456', client),
    ).rejects.toEqual(new AccountFlowError('OTP_INVALID'));
    await expect(
      verifyRegistrationOtp('student@colorplay.invalid', '654321', client),
    ).rejects.toEqual(new AccountFlowError('OTP_INVALID'));
    expect(verifyOtp).toHaveBeenNthCalledWith(1, {
      email: 'student@colorplay.invalid',
      token: '123456',
      type: 'email',
    });
  });

  it('preserves known registration errors returned by the Edge Function', async () => {
    const invoke = vi.fn().mockResolvedValue({
      error: {
        context: new Response(JSON.stringify({ error: 'ACCOUNT_TAKEN' }), {
          status: 409,
        }),
      },
    });

    await expect(
      completeStudentRegistration(
        registration,
        clientFor({ functions: { invoke } }),
      ),
    ).rejects.toEqual(new AccountFlowError('ACCOUNT_TAKEN'));
    expect(invoke).toHaveBeenCalledWith('student-register', {
      body: registration,
    });
  });

  it('collapses unknown and non-JSON registration failures to REGISTER_FAILED', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('provider detail') })
      .mockResolvedValueOnce({
        error: { context: new Response('not-json', { status: 500 }) },
      });
    const client = clientFor({ functions: { invoke } });

    await expect(
      completeStudentRegistration(registration, client),
    ).rejects.toEqual(new AccountFlowError('REGISTER_FAILED'));
    await expect(
      completeStudentRegistration(registration, client),
    ).rejects.toEqual(new AccountFlowError('REGISTER_FAILED'));
  });

  it('keeps password recovery and updates behind the stable reset failure contract', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ error: new Error('server detail') });
    const updateUser = vi
      .fn()
      .mockResolvedValue({ error: new Error('server detail') });
    const client = clientFor({ auth: { updateUser }, functions: { invoke } });

    await expect(
      requestPasswordReset(
        { account: '11500001', email: 'student@colorplay.invalid' },
        client,
      ),
    ).rejects.toEqual(new AccountFlowError('RESET_FAILED'));
    await expect(
      applyNewPassword('replacement-password', client),
    ).rejects.toEqual(new AccountFlowError('RESET_FAILED'));
    expect(invoke).toHaveBeenCalledWith('auth-recover', {
      body: { account: '11500001', email: 'student@colorplay.invalid' },
    });
    expect(updateUser).toHaveBeenCalledWith({
      password: 'replacement-password',
    });
  });
});
