type NamedKeyInput = {
  keySet: string | undefined;
  legacyKey: string | undefined;
  name?: string;
};

export function resolveNamedSupabaseKey({
  keySet,
  legacyKey,
  name = 'default',
}: NamedKeyInput): string {
  if (keySet === undefined) return legacyKey ?? '';

  try {
    const parsed: unknown = JSON.parse(keySet);
    if (typeof parsed !== 'object' || parsed === null || !(name in parsed)) {
      return '';
    }
    const value = (parsed as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

type EnvironmentReader = (name: string) => string | undefined;

export function readRuntimeSupabaseApiKeys(read: EnvironmentReader) {
  return {
    publishableKey: resolveNamedSupabaseKey({
      keySet: read('SUPABASE_PUBLISHABLE_KEYS'),
      legacyKey: read('SUPABASE_ANON_KEY'),
    }),
    secretKey: resolveNamedSupabaseKey({
      keySet: read('SUPABASE_SECRET_KEYS'),
      legacyKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    }),
  };
}
