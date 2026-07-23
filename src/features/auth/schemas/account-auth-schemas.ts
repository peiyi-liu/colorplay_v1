import { z } from 'zod';

// 與 supabase/functions/_shared/account.ts 的權威規則一致；此處僅供即時提示。
export const PASSWORD_POLICY_MESSAGE =
  '密碼需為 6 至 12 碼並包含大小寫英文字母';

const passwordPolicy = z
  .string()
  .regex(/^(?=.*[a-z])(?=.*[A-Z])\S{6,12}$/, PASSWORD_POLICY_MESSAGE);

const classCodeInput = z
  .string()
  .trim()
  .refine(
    (value) => /^[0-9A-F]{16}$/.test(value.toUpperCase().replace(/-/g, '')),
    '請輸入教師提供的 16 碼班級序號',
  );

export const accountSignInSchema = z.object({
  account: z.string().trim().min(1, '請輸入帳號'),
  classCode: z.string().trim().optional(),
  password: z.string().min(1, '請輸入密碼').max(128, '請輸入密碼'),
});

export type AccountSignInValues = z.infer<typeof accountSignInSchema>;

export const registerSchema = z
  .object({
    account: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{3,20}$/, '帳號（學號）需為 3 至 20 碼英數字'),
    classCode: classCodeInput,
    email: z.email('請輸入有效的 E-mail'),
    fullName: z
      .string()
      .trim()
      .min(1, '請輸入名字')
      .max(40, '名字最多 40 個字'),
    nickname: z
      .string()
      .trim()
      .min(2, '暱稱需為 2 至 16 個字')
      .max(16, '暱稱需為 2 至 16 個字'),
    password: passwordPolicy,
    passwordConfirm: z.string().min(1, '請再次輸入密碼'),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: '兩次輸入的密碼不一致',
    path: ['passwordConfirm'],
  });

export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  account: z.string().trim().min(1, '請輸入帳號'),
  email: z.email('請輸入有效的 E-mail'),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordPolicy,
    passwordConfirm: z.string().min(1, '請再次輸入新密碼'),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: '兩次輸入的密碼不一致',
    path: ['passwordConfirm'],
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
