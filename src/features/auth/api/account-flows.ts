import type { SupabaseClient } from '@supabase/supabase-js';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import type { Database } from '../../../types/database';

export type AccountFlowErrorCode =
  | 'OTP_SEND_FAILED'
  | 'OTP_INVALID'
  | 'EMAIL_NOT_VERIFIED'
  | 'NICKNAME_LENGTH'
  | 'NICKNAME_EMOJI'
  | 'NICKNAME_BANNED'
  | 'ACCOUNT_TAKEN'
  | 'INVALID_CLASSROOM_CODE'
  | 'WEAK_PASSWORD'
  | 'REGISTER_FAILED'
  | 'RESET_FAILED';

export class AccountFlowError extends Error {
  constructor(public readonly code: AccountFlowErrorCode) {
    super(code);
    this.name = 'AccountFlowError';
  }
}

type Client = SupabaseClient<Database>;

const resolveClient = (supplied?: Client): Client =>
  supplied ?? getBrowserSupabaseClient(parsePublicEnv(import.meta.env));

const KNOWN_REGISTER_CODES: readonly AccountFlowErrorCode[] = [
  'EMAIL_NOT_VERIFIED',
  'NICKNAME_LENGTH',
  'NICKNAME_EMOJI',
  'NICKNAME_BANNED',
  'ACCOUNT_TAKEN',
  'INVALID_CLASSROOM_CODE',
  'WEAK_PASSWORD',
];

const readFunctionErrorCode = async (
  error: unknown,
): Promise<string | null> => {
  if (typeof error !== 'object' || error === null) return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const body: unknown = await context.clone().json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const code = body.error;
      return typeof code === 'string' ? code : null;
    }
  } catch {
    return null;
  }
  return null;
};

export async function sendRegistrationOtp(
  email: string,
  supplied?: Client,
): Promise<void> {
  const client = resolveClient(supplied);
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new AccountFlowError('OTP_SEND_FAILED');
}

export async function verifyRegistrationOtp(
  email: string,
  token: string,
  supplied?: Client,
): Promise<void> {
  const client = resolveClient(supplied);
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error || !data.session) throw new AccountFlowError('OTP_INVALID');
}

export type StudentRegistrationInput = Readonly<{
  account: string;
  classCode: string;
  fullName: string;
  nickname: string;
  password: string;
}>;

export async function completeStudentRegistration(
  input: StudentRegistrationInput,
  supplied?: Client,
): Promise<void> {
  const client = resolveClient(supplied);
  const response = (await client.functions.invoke('student-register', {
    body: {
      account: input.account,
      classCode: input.classCode,
      fullName: input.fullName,
      nickname: input.nickname,
      password: input.password,
    },
  })) as Readonly<{ error: unknown }>;
  if (!response.error) return;
  const code = await readFunctionErrorCode(response.error);
  if (code && (KNOWN_REGISTER_CODES as readonly string[]).includes(code)) {
    throw new AccountFlowError(code as AccountFlowErrorCode);
  }
  throw new AccountFlowError('REGISTER_FAILED');
}

export async function requestPasswordReset(
  input: Readonly<{ account: string; email: string }>,
  supplied?: Client,
): Promise<void> {
  const client = resolveClient(supplied);
  // 防列舉：後端恆回泛用成功；僅網路／伺服器錯誤會拋錯。
  const response = (await client.functions.invoke('auth-recover', {
    body: { account: input.account, email: input.email },
  })) as Readonly<{ error: unknown }>;
  if (response.error) throw new AccountFlowError('RESET_FAILED');
}

export async function applyNewPassword(
  password: string,
  supplied?: Client,
): Promise<void> {
  const client = resolveClient(supplied);
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new AccountFlowError('RESET_FAILED');
}
