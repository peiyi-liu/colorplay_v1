import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('請輸入有效的 Email'),
  password: z
    .string()
    .min(8, '密碼需為 8 至 128 個字元')
    .max(128, '密碼需為 8 至 128 個字元'),
});

export type SignInValues = z.infer<typeof signInSchema>;
