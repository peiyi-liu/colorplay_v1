import { z } from 'zod';

const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

export type PublicEnv = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
}>;

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) throw new Error('APP_CONFIG_INVALID');

  return {
    supabaseUrl: result.data.VITE_SUPABASE_URL,
    supabaseAnonKey: result.data.VITE_SUPABASE_ANON_KEY,
  };
}
