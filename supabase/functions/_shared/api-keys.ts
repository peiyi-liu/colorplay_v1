// supabase/functions/_shared/api-keys.ts
// Resolves this project's Supabase API keys from either the new named
// key-set format (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, each a
// JSON object of {name: key}) or, only while a key-set variable was never
// configured at all, the single legacy key (SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY). Once a key-set variable IS set, any problem
// resolving the requested name -- malformed JSON, wrong shape, missing
// name, non-string/empty value -- fails closed. It never silently falls
// back to the legacy key mid-migration: that would let a deploy-time typo
// in the new format masquerade as a successful legacy rollback instead of
// surfacing as the configuration bug it is.

export class SupabaseApiKeyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseApiKeyConfigurationError';
  }
}

type EnvironmentReader = (name: string) => string | undefined;

const DEFAULT_KEY_NAME = 'default';
const SECRET_KEY_NAME_SELECTOR = 'COLORPLAY_SUPABASE_SECRET_KEY_NAME';

type NamedKeyInput = {
  keySet: string | undefined;
  legacyKey: string | undefined;
  keySetVariableName?: string;
  name?: string;
};

/** Throws SupabaseApiKeyConfigurationError on any fail-closed condition. */
export function resolveNamedSupabaseKey({
  keySet,
  legacyKey,
  keySetVariableName = 'the configured key-set variable',
  name = DEFAULT_KEY_NAME,
}: NamedKeyInput): string {
  if (keySet === undefined) {
    if (legacyKey === undefined || legacyKey === '') {
      throw new SupabaseApiKeyConfigurationError(
        `Neither ${keySetVariableName} nor its legacy fallback is configured.`,
      );
    }
    return legacyKey;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(keySet);
  } catch {
    throw new SupabaseApiKeyConfigurationError(
      `${keySetVariableName} is not valid JSON.`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SupabaseApiKeyConfigurationError(
      `${keySetVariableName} must be a JSON object of named keys.`,
    );
  }
  if (!(name in parsed)) {
    throw new SupabaseApiKeyConfigurationError(
      `${keySetVariableName} has no entry for the configured key name.`,
    );
  }
  const value = (parsed as Record<string, unknown>)[name];
  if (typeof value !== 'string' || value === '') {
    throw new SupabaseApiKeyConfigurationError(
      `${keySetVariableName}'s entry for the configured key name is invalid.`,
    );
  }
  return value;
}

/** Throws SupabaseApiKeyConfigurationError on any fail-closed condition. */
export function resolvePublishableKey(read: EnvironmentReader): string {
  return resolveNamedSupabaseKey({
    keySet: read('SUPABASE_PUBLISHABLE_KEYS'),
    legacyKey: read('SUPABASE_ANON_KEY'),
    keySetVariableName: 'SUPABASE_PUBLISHABLE_KEYS',
  });
}

/**
 * Throws SupabaseApiKeyConfigurationError on any fail-closed condition.
 * Which named entry to read out of SUPABASE_SECRET_KEYS is itself picked by
 * the non-secret COLORPLAY_SUPABASE_SECRET_KEY_NAME selector (defaulting to
 * "default" only when the selector is entirely unset) -- this lets a
 * project roll a freshly-named secret key without every consumer needing
 * its own copy of that name hardcoded. A selector that is explicitly set
 * but blank/whitespace is a deploy-time misconfiguration (e.g. a template
 * that failed to interpolate the intended name), not "not configured yet":
 * fail closed rather than silently defaulting.
 */
export function resolveSecretKey(read: EnvironmentReader): string {
  const selector = read(SECRET_KEY_NAME_SELECTOR);
  let secretKeyName: string;
  if (selector === undefined) {
    secretKeyName = DEFAULT_KEY_NAME;
  } else if (selector.trim() === '') {
    throw new SupabaseApiKeyConfigurationError(
      `${SECRET_KEY_NAME_SELECTOR} is set but blank.`,
    );
  } else {
    secretKeyName = selector;
  }
  return resolveNamedSupabaseKey({
    keySet: read('SUPABASE_SECRET_KEYS'),
    legacyKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    keySetVariableName: 'SUPABASE_SECRET_KEYS',
    name: secretKeyName,
  });
}

/** Throws SupabaseApiKeyConfigurationError on any fail-closed condition. */
export function readRuntimeSupabaseApiKeys(read: EnvironmentReader): {
  publishableKey: string;
  secretKey: string;
} {
  return {
    publishableKey: resolvePublishableKey(read),
    secretKey: resolveSecretKey(read),
  };
}
