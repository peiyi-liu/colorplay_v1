import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { BroadcastChannel } from 'node:worker_threads';
import { randomUUID, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
interface Event {
  event: string;
  subject: string | null;
}
interface Realm {
  ready(): Promise<void>;
  signIn(subject: string, sessionId: string): Promise<void>;
  signOut(): Promise<void>;
  canonical(): Promise<string | null>;
  userAccepted(): Promise<boolean>;
  clearEvents(): void;
  events(): Event[];
  singleton(): boolean;
  sdkKey(): string;
  storageGet(key: string): Promise<string | null>;
  storageSet(key: string, value: string): Promise<void>;
  storageRemove(key: string): Promise<void>;
  stop(): Promise<void>;
}
// Bundle the actual production module and installed SDK, not a replacement client.
const bundleOptions = {
  stdin: {
    resolveDir: process.cwd(),
    contents: `import {getBrowserSupabaseClient} from ${JSON.stringify(resolve('src/lib/supabase/browser-client.ts'))};
const env={supabaseUrl:'http://127.0.0.1:58321',supabaseAnonKey:'synthetic-public-key-only'};
const client=getBrowserSupabaseClient(env); let events=[];
client.auth.onAuthStateChange((event,session)=>{events.push({event,subject:session?.user.id??null});});
const encode=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
globalThis.realmProbe={
 ready:async()=>{await client.auth.getSession();},
 signIn:async(subject,sessionId)=>{const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:subject,session_id:sessionId,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.c3ludGhldGlj';const result=await client.auth.setSession({access_token:token,refresh_token:'SYNTHETIC_REFRESH'});if(result.error)throw Error('SYNTHETIC_AUTH_REJECTED');},
 signOut:async()=>{const result=await client.auth.signOut({scope:'local'});if(result.error)throw Error('SYNTHETIC_AUTH_REJECTED');},
 canonical:async()=>{const result=await client.auth.getSession();return result.data.session?.user.id??null;},
 userAccepted:async()=>{const result=await client.auth.getUser();return result.error===null&&!!result.data.user;},
 clearEvents:()=>{events=[];},events:()=>events,
 singleton:()=>client===getBrowserSupabaseClient(env),sdkKey:()=>client.auth.storageKey,
 storageGet:async(key)=>client.auth.storage.getItem(key),storageSet:async(key,value)=>{await client.auth.storage.setItem(key,value);},storageRemove:async(key)=>{await client.auth.storage.removeItem(key);},
 stop:async()=>{await client.auth.stopAutoRefresh();await client.realtime.disconnect();}
};`,
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  logLevel: 'silent',
};
// esbuild must run in a native Node realm, not jsdom's mixed TypedArray realm.
const bundle = execFileSync(
  process.execPath,
  [
    '-e',
    `const {createRequire}=require('node:module');const esbuild=createRequire(require.resolve('tsx'))('esbuild');process.stdout.write(esbuild.buildSync(${JSON.stringify(bundleOptions)}).outputFiles[0].text);`,
  ],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
const active: {
  api: Realm;
  channels: BroadcastChannel[];
  constructions: () => number;
}[] = [];
const revoked = new Set<string>();
const subject1 = '11000000-0000-4000-8000-000000000001';
const subject2 = '11000000-0000-4000-8000-000000000002';
const canonicalKey = (values: Map<string, string>) =>
  `sb-127-auth-token-${values.get('colorplay-auth-tab-id') ?? ''}`;
const newRealm = async (seed = new Map<string, string>()) => {
  const values = new Map(seed);
  const channels: BroadcastChannel[] = [];
  const storage: Storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.origin !== 'http://127.0.0.1:58321')
      throw new Error('SYNTHETIC_UNEXPECTED_TARGET');
    const token =
      new Headers(init?.headers).get('authorization')?.slice(7) ?? '';
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    ) as { sub: string; session_id: string };
    if (url.pathname === '/auth/v1/logout') {
      revoked.add(claims.session_id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.pathname !== '/auth/v1/user')
      throw new Error('SYNTHETIC_UNEXPECTED_PATH');
    if (revoked.has(claims.session_id))
      return Promise.resolve(
        Response.json(
          {
            code: 401,
            error_code: 'session_not_found',
            message: 'SYNTHETIC_REVOKED',
          },
          { status: 401 },
        ),
      );
    return Promise.resolve(
      Response.json({
        id: claims.sub,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      }),
    );
  });
  const errors = vi.fn();
  let socketConstructions = 0;
  const location = { href: 'http://127.0.0.1:58373/', hash: '', search: '' };
  const document = { visibilityState: 'hidden' };
  const navigator = {};
  const context = createContext({
    window: {
      sessionStorage: storage,
      location,
      document,
      navigator,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    document,
    navigator,
    location,
    WebSocket: class {
      readonly readyState = 3;
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor() {
        socketConstructions++;
        throw new Error('SYNTHETIC_SOCKET_FORBIDDEN');
      }
    },
    crypto: webcrypto,
    fetch: fetcher,
    Headers,
    Response,
    Request,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    DOMException,
    ReadableStream,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    btoa,
    atob,
    console: {
      log: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: errors,
    },
    BroadcastChannel: class extends BroadcastChannel {
      constructor(name: string) {
        super(name);
        channels.push(this);
      }
    },
  });
  runInContext(bundle, context);
  const api = Reflect.get(context, 'realmProbe') as Realm;
  active.push({ api, channels, constructions: () => socketConstructions });
  await api.ready();
  return {
    api,
    values,
    fetcher,
    errors,
    socketConstructions: () => socketConstructions,
    channelNames: () => channels.map((channel) => channel.name),
  };
};
const foreignEvent = async (
  realm: Realm,
  event: string,
  subject: string | null,
) => {
  // Native BC delivery is asynchronous. A finite observation window is test-only;
  // no product polling, timeout or lifecycle behavior is changed.
  await new Promise((done) => setTimeout(done, 40));
  return realm
    .events()
    .some((value) => value.event === event && value.subject === subject);
};
afterEach(async () => {
  await Promise.all(
    active.splice(0).map(async ({ api, channels, constructions }) => {
      try {
        await api.stop();
      } finally {
        for (const channel of channels) channel.close();
        expect(constructions()).toBe(0);
      }
    }),
  );
  revoked.clear();
});
describe('actual production client with copied document storage and native Auth broadcasts', () => {
  it('does not send independent sign-in or logout notifications across copied documents', async () => {
    const first = await newRealm();
    await first.api.signIn(subject1, randomUUID());
    const copy = await newRealm(first.values);
    expect(copy.values.get('colorplay-auth-tab-id')).toBe(
      first.values.get('colorplay-auth-tab-id'),
    );
    expect(await copy.api.canonical()).toBe(subject1);
    await copy.api.signOut();
    await first.api.signOut();
    first.api.clearEvents();
    copy.api.clearEvents();
    await first.api.signIn(subject1, randomUUID());
    expect(await foreignEvent(copy.api, 'SIGNED_IN', subject1)).toBe(false);
    expect(await copy.api.canonical()).toBeNull();
    await copy.api.signIn(subject2, randomUUID());
    expect(await foreignEvent(first.api, 'SIGNED_IN', subject2)).toBe(false);
    expect(await first.api.canonical()).toBe(subject1);
    await copy.api.signOut();
    expect(await foreignEvent(first.api, 'SIGNED_OUT', null)).toBe(false);
    expect(await first.api.canonical()).toBe(subject1);
    expect(first.api.events()).toContainEqual({
      event: 'SIGNED_IN',
      subject: subject1,
    });
    expect(copy.api.events()).toContainEqual({
      event: 'SIGNED_IN',
      subject: subject2,
    });
    expect(copy.api.events()).toContainEqual({
      event: 'SIGNED_OUT',
      subject: null,
    });
    expect(first.channelNames()[0]).not.toBe(copy.channelNames()[0]);
    expect(first.errors).not.toHaveBeenCalled();
    expect(copy.errors).not.toHaveBeenCalled();
    expect(first.socketConstructions()).toBe(0);
    expect(copy.socketConstructions()).toBe(0);
  });
  it('retains shared-server-session revocation rather than making copied credentials valid', async () => {
    const first = await newRealm();
    await first.api.signIn(subject1, randomUUID());
    const copy = await newRealm(first.values);
    expect(await copy.api.canonical()).toBe(subject1);
    await copy.api.signOut();
    expect(await first.api.userAccepted()).toBe(false);
    expect(first.fetcher).toHaveBeenCalledTimes(2);
  });
  it('restores canonical data on reload while fresh no-opener documents stay anonymous', async () => {
    const first = await newRealm();
    await first.api.signIn(subject1, randomUUID());
    const key = canonicalKey(first.values);
    const original = first.values.get(key);
    const reload = await newRealm(first.values);
    const fresh = await newRealm();
    expect(await reload.api.canonical()).toBe(subject1);
    expect(reload.values.get(key)).toBe(original);
    expect(await fresh.api.canonical()).toBeNull();
    expect(fresh.fetcher).not.toHaveBeenCalled();
    expect(reload.api.singleton()).toBe(true);
    expect(reload.api.sdkKey()).not.toBe(first.api.sdkKey());
  });
  it('maps only this SDK namespace and its exact PKCE/user companion keys', async () => {
    const first = await newRealm();
    await first.api.signIn(subject1, randomUUID());
    const canonical = canonicalKey(first.values);
    const sdk = first.api.sdkKey();
    expect(first.values.has(sdk)).toBe(false);
    expect(await first.api.storageGet(sdk)).toBe(first.values.get(canonical));
    await first.api.storageSet(`${sdk}-code-verifier`, 'SYNTHETIC_PKCE');
    await first.api.storageSet(`${sdk}-user`, 'SYNTHETIC_USER');
    expect(first.values.get(`${canonical}-code-verifier`)).toBe(
      'SYNTHETIC_PKCE',
    );
    expect(first.values.get(`${canonical}-user`)).toBe('SYNTHETIC_USER');
    const before = new Map(first.values);
    const other = `${canonical}-other-document`;
    await expect(
      first.api.storageSet(other, 'SYNTHETIC_CROSS_SESSION'),
    ).rejects.toThrow('AUTH_STORAGE_KEY_INVALID');
    await expect(first.api.storageGet(`${sdk}-user-extra`)).rejects.toThrow(
      'AUTH_STORAGE_KEY_INVALID',
    );
    await expect(
      first.api.storageRemove('sb-other-project-auth-token'),
    ).rejects.toThrow('AUTH_STORAGE_KEY_INVALID');
    expect(first.values).toEqual(before);
    const reload = await newRealm(first.values);
    const reloadedSdk = reload.api.sdkKey();
    expect(await reload.api.storageGet(`${reloadedSdk}-code-verifier`)).toBe(
      'SYNTHETIC_PKCE',
    );
    expect(await reload.api.storageGet(`${reloadedSdk}-user`)).toBe(
      'SYNTHETIC_USER',
    );
    // Actual SDK logout must clear its mapped session and both companions.
    await reload.api.signOut();
    expect(reload.values.has(canonical)).toBe(false);
    expect(reload.values.has(`${canonical}-code-verifier`)).toBe(false);
    expect(reload.values.has(`${canonical}-user`)).toBe(false);
    expect(first.values.get(canonical)).toBe(before.get(canonical));
    expect(first.socketConstructions()).toBe(0);
    expect(reload.socketConstructions()).toBe(0);
  });
  it('keeps legacy migration and current scoped session precedence', async () => {
    const first = await newRealm();
    await first.api.signIn(subject1, randomUUID());
    const value = first.values.get(canonicalKey(first.values));
    if (!value) throw new Error('SYNTHETIC_SESSION_MISSING');
    const legacy = await newRealm(new Map([['sb-127-auth-token', value]]));
    expect(await legacy.api.canonical()).toBe(subject1);
    expect(legacy.values.has('sb-127-auth-token')).toBe(false);
    const second = await newRealm();
    await second.api.signIn(subject2, randomUUID());
    const other = second.values.get(canonicalKey(second.values));
    if (!other) throw new Error('SYNTHETIC_SESSION_MISSING');
    const current = new Map(first.values);
    current.set('sb-127-auth-token', other);
    const priority = await newRealm(current);
    expect(await priority.api.canonical()).toBe(subject1);
    expect(priority.values.has('sb-127-auth-token')).toBe(false);
  });
});
