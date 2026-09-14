import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const createClient = vi.fn(() => ({
  auth: { signInWithPassword },
}));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

const TRAP = {
  message: 'trap-message-do-not-log',
  details: 'trap-details-do-not-log',
  hint: 'trap-hint-do-not-log',
  url: 'trap-url-do-not-log',
  key: 'trap-key-do-not-log',
  email: 'trap-email@example.com',
  password: 'trap-password-do-not-log',
};

const CREDENTIALS = { email: TRAP.email, password: TRAP.password };

async function loadSignedInClient() {
  vi.resetModules();
  const module = await import('./signed-in-client');
  return module.signedInClient;
}

async function callWithEnv(
  env: Record<string, string | undefined>,
): Promise<unknown> {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const signedInClient = await loadSignedInClient();
  return signedInClient(CREDENTIALS);
}

const LOCAL_URL = 'http://127.0.0.1:54321';
const STAGING_URL = 'https://onkxnkzeixpezetkmocf.supabase.co';
const PRODUCTION_URL = 'https://xdjumzdqyexpyndanwkp.supabase.co';
const STAGING_GATES = {
  PLAYWRIGHT_ACCEPTANCE: 'on',
  COLORPLAY_DEPLOYMENT_ENVIRONMENT: 'staging',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createClient.mockClear();
  signInWithPassword.mockClear();
});

describe('signedInClient public environment guard', () => {
  it('accepts the existing Local URL without requiring the Hosted acceptance gates', async () => {
    await expect(
      callWithEnv({
        SUPABASE_URL: LOCAL_URL,
        SUPABASE_ANON_KEY: TRAP.key,
        PLAYWRIGHT_ACCEPTANCE: undefined,
        COLORPLAY_DEPLOYMENT_ENVIRONMENT: undefined,
      }),
    ).resolves.toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      LOCAL_URL,
      TRAP.key,
      expect.objectContaining({
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    );
  });

  it('accepts the exact Staging Supabase URL only when both gates are present', async () => {
    await expect(
      callWithEnv({
        SUPABASE_URL: STAGING_URL,
        SUPABASE_ANON_KEY: TRAP.key,
        ...STAGING_GATES,
      }),
    ).resolves.toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      STAGING_URL,
      TRAP.key,
      expect.anything(),
    );
  });

  it.each([['a trailing slash root path', `${STAGING_URL}/`]])(
    'accepts a normalized Staging URL: %s',
    async (_label, url) => {
      await expect(
        callWithEnv({
          SUPABASE_URL: url,
          SUPABASE_ANON_KEY: TRAP.key,
          ...STAGING_GATES,
        }),
      ).resolves.toBeDefined();
    },
  );

  it.each([
    [
      'PLAYWRIGHT_ACCEPTANCE missing',
      { COLORPLAY_DEPLOYMENT_ENVIRONMENT: 'staging' },
    ],
    [
      'COLORPLAY_DEPLOYMENT_ENVIRONMENT missing',
      { PLAYWRIGHT_ACCEPTANCE: 'on' },
    ],
    ['both gates missing', {}],
    [
      'PLAYWRIGHT_ACCEPTANCE wrong value',
      {
        PLAYWRIGHT_ACCEPTANCE: 'true',
        COLORPLAY_DEPLOYMENT_ENVIRONMENT: 'staging',
      },
    ],
    [
      'COLORPLAY_DEPLOYMENT_ENVIRONMENT wrong value',
      {
        PLAYWRIGHT_ACCEPTANCE: 'on',
        COLORPLAY_DEPLOYMENT_ENVIRONMENT: 'production',
      },
    ],
  ])('rejects the Staging URL when %s', async (_label, env) => {
    await expect(
      callWithEnv({
        SUPABASE_URL: STAGING_URL,
        SUPABASE_ANON_KEY: TRAP.key,
        PLAYWRIGHT_ACCEPTANCE: undefined,
        COLORPLAY_DEPLOYMENT_ENVIRONMENT: undefined,
        ...env,
      }),
    ).rejects.toThrow('LOCAL_PUBLIC_ENV_INVALID');
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-root path', `${LOCAL_URL}/rest/v1`],
    ['a query string', `${LOCAL_URL}/?token=1`],
    ['a fragment', `${LOCAL_URL}/#frag`],
    ['embedded URL credentials', 'http://user:pass@127.0.0.1:54321'],
  ])('rejects a Local URL variant: %s', async (_label, url) => {
    await expect(
      callWithEnv({
        SUPABASE_URL: url,
        SUPABASE_ANON_KEY: TRAP.key,
        PLAYWRIGHT_ACCEPTANCE: undefined,
        COLORPLAY_DEPLOYMENT_ENVIRONMENT: undefined,
      }),
    ).rejects.toThrow('LOCAL_PUBLIC_ENV_INVALID');
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ['Production Supabase project', PRODUCTION_URL],
    ['a localhost lookalike hostname', 'https://localhost.supabase.co'],
    [
      'a subdomain lookalike of the Staging project',
      'https://evil.onkxnkzeixpezetkmocf.supabase.co',
    ],
    [
      'a suffix lookalike of the Staging hostname',
      'https://onkxnkzeixpezetkmocf.supabase.co.evil.example',
    ],
    ['plain HTTP instead of HTTPS', 'http://onkxnkzeixpezetkmocf.supabase.co'],
    [
      'a non-default HTTPS port',
      'https://onkxnkzeixpezetkmocf.supabase.co:8443',
    ],
    ['a non-root path', 'https://onkxnkzeixpezetkmocf.supabase.co/rest/v1'],
    ['a query string', 'https://onkxnkzeixpezetkmocf.supabase.co/?token=1'],
    ['a fragment', 'https://onkxnkzeixpezetkmocf.supabase.co/#frag'],
    [
      'embedded URL credentials',
      'https://user:pass@onkxnkzeixpezetkmocf.supabase.co',
    ],
  ])('rejects %s even with both gates present', async (_label, url) => {
    await expect(
      callWithEnv({
        SUPABASE_URL: url,
        SUPABASE_ANON_KEY: TRAP.key,
        ...STAGING_GATES,
      }),
    ).rejects.toThrow('LOCAL_PUBLIC_ENV_INVALID');
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a Staging-lookalike URL trap',
      {
        SUPABASE_URL: `https://${TRAP.url}.supabase.co`,
        SUPABASE_ANON_KEY: TRAP.key,
        ...STAGING_GATES,
      },
    ],
    [
      'missing SUPABASE_URL and SUPABASE_ANON_KEY',
      {
        SUPABASE_URL: undefined,
        SUPABASE_ANON_KEY: undefined,
      },
    ],
    [
      'a malformed URL',
      {
        SUPABASE_URL: 'not a valid url',
        SUPABASE_ANON_KEY: TRAP.key,
        ...STAGING_GATES,
      },
    ],
  ])(
    'never leaks secret-like values in the thrown diagnostic: %s',
    async (_label, env) => {
      let thrown: unknown;
      try {
        await callWithEnv(env);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const messageText = (thrown as Error).message;
      expect(messageText).not.toContain(TRAP.message);
      expect(messageText).not.toContain(TRAP.details);
      expect(messageText).not.toContain(TRAP.hint);
      expect(messageText).not.toContain(TRAP.url);
      expect(messageText).not.toContain(TRAP.key);
      expect(messageText).not.toContain(TRAP.email);
      expect(messageText).not.toContain(TRAP.password);
      expect([
        'LOCAL_PUBLIC_ENV_MISSING',
        'LOCAL_PUBLIC_ENV_INVALID',
      ]).toContain(messageText);
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it('wraps a synchronous createClient throw as the fixed sign-in sentinel without leaking trap values', async () => {
    createClient.mockImplementationOnce(() => {
      throw new Error(
        `sdk exploded url=${TRAP.url} key=${TRAP.key} email=${TRAP.email} password=${TRAP.password} message=${TRAP.message} details=${TRAP.details} hint=${TRAP.hint}`,
      );
    });

    let thrown: unknown;
    try {
      await callWithEnv({
        SUPABASE_URL: LOCAL_URL,
        SUPABASE_ANON_KEY: TRAP.key,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const messageText = (thrown as Error).message;
    expect(messageText).toBe('LOCAL_SIGN_IN_FAILED');
    expect(messageText).not.toContain(TRAP.url);
    expect(messageText).not.toContain(TRAP.key);
    expect(messageText).not.toContain(TRAP.email);
    expect(messageText).not.toContain(TRAP.password);
    expect(messageText).not.toContain(TRAP.message);
    expect(messageText).not.toContain(TRAP.details);
    expect(messageText).not.toContain(TRAP.hint);
  });

  it('wraps a rejected signInWithPassword promise as the fixed sign-in sentinel without leaking trap values', async () => {
    signInWithPassword.mockRejectedValueOnce(
      new Error(
        `network exploded url=${TRAP.url} key=${TRAP.key} email=${TRAP.email} password=${TRAP.password} message=${TRAP.message} details=${TRAP.details} hint=${TRAP.hint}`,
      ),
    );

    let thrown: unknown;
    try {
      await callWithEnv({
        SUPABASE_URL: LOCAL_URL,
        SUPABASE_ANON_KEY: TRAP.key,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const messageText = (thrown as Error).message;
    expect(messageText).toBe('LOCAL_SIGN_IN_FAILED');
    expect(messageText).not.toContain(TRAP.url);
    expect(messageText).not.toContain(TRAP.key);
    expect(messageText).not.toContain(TRAP.email);
    expect(messageText).not.toContain(TRAP.password);
    expect(messageText).not.toContain(TRAP.message);
    expect(messageText).not.toContain(TRAP.details);
    expect(messageText).not.toContain(TRAP.hint);
  });

  it('rejects with a fixed sentinel and never calls the Supabase client boundary when the URL is malformed', async () => {
    await expect(
      callWithEnv({
        SUPABASE_URL: 'not a valid url',
        SUPABASE_ANON_KEY: TRAP.key,
        ...STAGING_GATES,
      }),
    ).rejects.toThrow('LOCAL_PUBLIC_ENV_INVALID');
    expect(createClient).not.toHaveBeenCalled();
  });
});
