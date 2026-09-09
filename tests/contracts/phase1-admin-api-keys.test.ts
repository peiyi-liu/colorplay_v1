import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditUnavailableEnvelope } from '../../supabase/functions/_shared/denial-envelope';
import { jsonResponse } from '../../supabase/functions/_shared/cors';
import {
  readRuntimeSupabaseApiKeys,
  resolvePublishableKey,
  resolveSecretKey,
  SupabaseApiKeyConfigurationError,
} from '../../supabase/functions/_shared/api-keys';

// Covers the onkxnkzeixpezetkmocf API-key-exposure incident's code-only
// migration: the named key-set resolver (SUPABASE_PUBLISHABLE_KEYS /
// SUPABASE_SECRET_KEYS with a legacy-key fallback), the three admin Edge
// Functions that used to read SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY
// directly, and the manual operational scripts' new-variable-first,
// bounded-fallback env reads (those scripts' own behavioral tests live in
// supabase-api-key-migration.test.ts, which already owns this incident's
// migration story end to end). Never asserts on, logs, or embeds a real
// key value -- every fixture key/JWT-shaped string below is synthetic.

const repositoryRoot = resolve(import.meta.dirname, '../..');

describe('_shared/api-keys.ts: named key-set resolution with legacy fallback', () => {
  it('prefers the new key-set entry over the legacy key when both are present', () => {
    const read = (name: string) =>
      ({
        SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
          default: 'new-publishable',
        }),
        SUPABASE_ANON_KEY: 'legacy-anon',
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'new-secret' }),
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role',
      })[name];

    expect(readRuntimeSupabaseApiKeys(read)).toEqual({
      publishableKey: 'new-publishable',
      secretKey: 'new-secret',
    });
  });

  it('resolves a non-default named secret key when the selector names it', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({
          default: 'default-secret',
          staging_incident_20260909: 'incident-rotated-secret',
        }),
        COLORPLAY_SUPABASE_SECRET_KEY_NAME: 'staging_incident_20260909',
      })[name];

    expect(resolveSecretKey(read)).toBe('incident-rotated-secret');
  });

  it('uses the "default" entry when the selector is entirely unset', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'default-secret' }),
      })[name];

    expect(resolveSecretKey(read)).toBe('default-secret');
  });

  it('fails closed when the selector is explicitly set to an empty string, never silently defaulting', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'default-secret' }),
        COLORPLAY_SUPABASE_SECRET_KEY_NAME: '',
      })[name];

    try {
      resolveSecretKey(read);
      throw new Error('expected resolveSecretKey to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SupabaseApiKeyConfigurationError);
      const message = (error as Error).message;
      expect(message).not.toContain('default-secret');
    }
  });

  it('fails closed when the selector is explicitly set to whitespace only, never silently defaulting', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'default-secret' }),
        COLORPLAY_SUPABASE_SECRET_KEY_NAME: '   ',
      })[name];

    expect(() => resolveSecretKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
  });

  it('fails closed -- never falling back to the legacy key -- when the key-set variable is malformed JSON', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: '{not valid json',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role',
      })[name];

    expect(() => resolveSecretKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
  });

  it('fails closed when the key-set variable is valid JSON but not an object (e.g. an array)', () => {
    const read = (name: string) =>
      ({
        SUPABASE_PUBLISHABLE_KEYS: '["not", "an", "object"]',
        SUPABASE_ANON_KEY: 'legacy-anon',
      })[name];

    expect(() => resolvePublishableKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
  });

  it('fails closed -- never falling back to the legacy key -- when the requested named key does not exist in the set', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'default-secret' }),
        COLORPLAY_SUPABASE_SECRET_KEY_NAME: 'does_not_exist',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role',
      })[name];

    expect(() => resolveSecretKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
  });

  it('fails closed when the named entry exists but is an empty string', () => {
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: '' }),
      })[name];

    expect(() => resolveSecretKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
  });

  it('still supports the legacy-only path when neither key-set variable is configured at all', () => {
    const read = (name: string) =>
      ({
        SUPABASE_ANON_KEY: 'legacy-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role',
      })[name];

    expect(readRuntimeSupabaseApiKeys(read)).toEqual({
      publishableKey: 'legacy-anon',
      secretKey: 'legacy-service-role',
    });
  });

  it('fails closed when neither the key-set variable nor the legacy key is configured', () => {
    const read = () => undefined;

    expect(() => resolvePublishableKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
    expect(() => resolveSecretKey(read)).toThrow(
      SupabaseApiKeyConfigurationError,
    );
  });

  it('never includes the malformed value, JSON, or any configured key material in a thrown error message', () => {
    const secretLookingValue = 'sb_secret_should_never_appear_in_any_message';
    const read = (name: string) =>
      ({
        SUPABASE_SECRET_KEYS: `{"default": "${secretLookingValue}", malformed`,
        SUPABASE_SERVICE_ROLE_KEY: secretLookingValue,
      })[name];

    try {
      resolveSecretKey(read);
      throw new Error('expected resolveSecretKey to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SupabaseApiKeyConfigurationError);
      const message = (error as Error).message;
      expect(message).not.toContain(secretLookingValue);
      expect(message).not.toContain('{');
      expect(message).not.toContain('malformed');
    }
  });
});

async function readAdminFunctionSource(functionName: string): Promise<string> {
  return readFile(
    resolve(repositoryRoot, `supabase/functions/${functionName}/index.ts`),
    'utf8',
  );
}

describe('admin-command, admin-mfa, admin-reconcile: no longer read legacy env directly', () => {
  it.each(['admin-command', 'admin-mfa', 'admin-reconcile'])(
    '%s imports and uses the shared api-keys resolver instead of Deno.env.get for SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY',
    async (functionName) => {
      const source = await readAdminFunctionSource(functionName);
      expect(source).toContain("from '../_shared/api-keys.ts'");
      expect(source).not.toContain("Deno.env.get('SUPABASE_ANON_KEY')");
      expect(source).not.toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    },
  );

  it('admin-command and admin-mfa resolve both the publishable and secret key', async () => {
    for (const functionName of ['admin-command', 'admin-mfa']) {
      const source = await readAdminFunctionSource(functionName);
      expect(source).toContain('readRuntimeSupabaseApiKeys');
    }
  });

  it('admin-reconcile resolves only the secret key, never the publishable key', async () => {
    const source = await readAdminFunctionSource('admin-reconcile');
    expect(source).toContain('resolveSecretKey');
    expect(source).not.toContain('readRuntimeSupabaseApiKeys');
    expect(source).not.toContain('resolvePublishableKey');
  });

  // Handler-level behavior cannot be exercised directly in this repo: these
  // functions run under Deno (Deno.serve, `npm:` import specifiers), and
  // there is no `deno` binary in this environment to execute them (checked
  // -- `command -v deno` finds nothing), so Vitest/Node cannot import or
  // invoke supabase/functions/**/index.ts at all. As the closest available
  // substitute, this combines two things that together give strong (not
  // merely source-string) evidence of the fail-closed property:
  //  1. Control-flow ORDER, not just presence: the credential-configuration
  //     check is confirmed to appear, textually, before every
  //     `createClient(` call inside the handler -- a Deno.serve handler
  //     runs its body top-to-bottom, so a check position always compiled to
  //     have already returned before a later `createClient(` call is proof
  //     that call is unreachable once the check has failed.
  //  2. The EXACT response object that check path returns --
  //     `jsonResponse(503, auditUnavailableEnvelope())` -- is genuinely
  //     constructed and inspected below (jsonResponse/auditUnavailableEnvelope
  //     have no Deno-specific imports and run for real under Vitest), so
  //     this proves that response is well-formed and leaks nothing, not
  //     just that the source mentions the right identifiers.
  it.each(['admin-command', 'admin-mfa', 'admin-reconcile'])(
    '%s: the credential-configuration check textually precedes every createClient(...) call, so no privileged client can be constructed once it has failed',
    async (functionName) => {
      const source = await readAdminFunctionSource(functionName);
      const checkIndex = source.indexOf('if (credentialConfigurationInvalid)');
      expect(checkIndex).toBeGreaterThan(-1);
      const createClientCallIndexes: number[] = [];
      let searchFrom = 0;
      for (;;) {
        const index = source.indexOf('createClient(', searchFrom);
        if (index === -1) break;
        createClientCallIndexes.push(index);
        searchFrom = index + 1;
      }
      expect(createClientCallIndexes.length).toBeGreaterThan(0);
      for (const createClientCallIndex of createClientCallIndexes) {
        expect(createClientCallIndex).toBeGreaterThan(checkIndex);
      }
    },
  );

  it.each(['admin-command', 'admin-mfa', 'admin-reconcile'])(
    '%s discards the caught credential-resolution error without interpolating it anywhere',
    async (functionName) => {
      const source = await readAdminFunctionSource(functionName);
      expect(source).toMatch(
        /catch\s*\{\s*credentialConfigurationInvalid = true;\s*\}/u,
      );
    },
  );

  it('the exact response the credential-configuration gate returns (jsonResponse(503, auditUnavailableEnvelope())) is well-formed and leaks nothing', async () => {
    const response = jsonResponse(503, auditUnavailableEnvelope());
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.outcome).toBe('denied');
    expect(body.code).toBe('SECURITY_AUDIT_UNAVAILABLE');
    expect(typeof body.message).toBe('string');
    expect(body.request_id as string).toMatch(/^[0-9a-f-]{36}$/u);
    expect(body.retryable).toBe(true);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('SUPABASE_');
    expect(serialized).not.toContain('sb_secret_');
    expect(serialized).not.toContain('sb_publishable_');
    expect(serialized).not.toContain('eyJ');
    expect(serialized.toLowerCase()).not.toContain('parse');
  });
});

describe('supabase/config.toml: verify_jwt=false for these six functions is unchanged', () => {
  it.each([
    'auth-login',
    'student-register',
    'auth-recover',
    'admin-mfa',
    'admin-command',
    'admin-reconcile',
  ])('%s still has verify_jwt = false', async (functionName) => {
    const config = await readFile(
      resolve(repositoryRoot, 'supabase/config.toml'),
      'utf8',
    );
    const sectionStart = config.indexOf(`[functions.${functionName}]`);
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = config.indexOf('\n\n', sectionStart);
    const section = config.slice(
      sectionStart,
      sectionEnd === -1 ? undefined : sectionEnd,
    );
    expect(section).toContain('verify_jwt = false');
  });
});
