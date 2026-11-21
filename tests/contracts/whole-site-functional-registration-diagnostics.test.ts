import { errors, type Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mailpit from '../../scripts/concurrency/mailpit';
import { registerFunctionalStudent } from '../../scripts/concurrency/auth-journey';
import * as fixtures from './helpers/whole-site-functional';

afterEach(() => vi.restoreAllMocks());
describe('actual registration checkpoints', () => {
  it('records the first failed mailbox phase without exposing the original error', async () => {
    const marker = 'SYNTHETIC_SECRET_URL_TOKEN_PASSWORD';
    const error = new Error(marker);
    vi.spyOn(mailpit, 'createOwnedMailbox').mockImplementation(() => {
      throw error;
    });
    const writes: { name: string; value: unknown }[] = [];
    const journal = {
      directory: 'synthetic',
      write: async (name: string, value: unknown) => {
        writes.push({ name, value });
        await Promise.resolve();
      },
    };
    const goto = vi.fn();
    const page = { goto } as unknown as Page;
    await expect(
      registerFunctionalStudent(
        page,
        fixtures.syntheticScope(),
        {
          label: 'R1',
          userId: null,
          account: 'synthetic',
          displayName: 'Synthetic',
          email: 'synthetic@colorplay.test',
          password: marker,
          replacementPassword: marker,
        },
        { classroomId: 'synthetic-class', joinCode: 'ABCDEFGH' },
        fixtures.syntheticSecrets,
        journal,
        new AbortController().signal,
      ),
    ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    expect(writes.map((row) => row.name)).toEqual([
      'registration-mailbox-baseline-started',
      'registration-mailbox-baseline-failed',
    ]);
    expect(JSON.stringify(writes)).not.toContain(marker);
    expect(goto).not.toHaveBeenCalled();
  });
});

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as runtime from '../../scripts/concurrency/local-runtime';
import * as profiles from '../../src/features/profile/api/profile-repository';
import * as classrooms from '../../src/features/classrooms/api/classroom-repository';
import * as session from '../e2e/helpers/staging-capacity-browser';
import {
  createRegistrationDiagnostics,
  registrationPhases,
  registrationCheckpointSchema,
} from '../../scripts/concurrency/auth-recovery-diagnostics';
import { createPrivateJournal } from '../../scripts/concurrency/private-journal';
import { FunctionalError } from '../../scripts/concurrency/config';
import type { FunctionalIdentity } from '../../scripts/concurrency/owned-fixtures';

type Phase = (typeof registrationPhases)[number];
const safeMail = () => ({
  phase: 'OTP_PARSE' as const,
  reason: null,
  polls: 1,
  baselineCount: 0,
  newMatches: 1,
  statusClass: 'OK' as const,
  recipientExact: true,
  otpCount: 1,
});
const setup = () => {
  const writes: { name: string; value: unknown }[] = [];
  const events: string[] = [];
  const controller = new AbortController();
  const identity: FunctionalIdentity = {
    label: 'R1',
    userId: null,
    account: 'synthetic',
    displayName: 'Synthetic',
    email: 'synthetic@colorplay.test',
    password: 'SYNTHETIC_PASSWORD',
    replacementPassword: 'SYNTHETIC_REPLACEMENT',
  };
  let current: Phase = 'mailbox_baseline';
  const controls: {
    fail?: Phase;
    writeFail?: string;
    hold?: (event: string) => Promise<void>;
    badProfile?: boolean;
    badMembership?: boolean;
    badSnapshot?: boolean;
  } = {};
  const original = new Error('SYNTHETIC_PRIVATE_URL_TOKEN_EMAIL_PASSWORD');
  const act = async (event: string) => {
    events.push(`${current}:${event}`);
    if (controls.fail === current) throw original;
    await controls.hold?.(`${current}:${event}`);
  };
  const journal = {
    directory: 'synthetic',
    write: vi.fn(async (name: string, value: unknown) => {
      if (name.endsWith('-started'))
        current = (value as { phase: Phase }).phase;
      if (controls.writeFail === name)
        throw new Error('SYNTHETIC_WRITER_SECRET');
      if (name === 'registration-intent' || name === 'registration-confirmed')
        await act('original-write');
      writes.push({ name, value });
    }),
  };
  vi.spyOn(mailpit, 'createOwnedMailbox').mockImplementation(() => {
    if (controls.fail === 'mailbox_baseline') throw original;
    return {
      baseline: async () => {
        await act('baseline');
        return new Set<string>();
      },
      wait: async () => {
        await act('mail');
        return '123456';
      },
      diagnostics: () => {
        if (controls.badSnapshot) throw original;
        return safeMail();
      },
    };
  });
  const locator = (name: string) => ({
    _apiName: 'Locator',
    _expect: async () => {
      await act('expect:' + name);
      return { matches: true, received: 'visible', log: [] };
    },
    first: () => locator(name),
    fill: async () => act('fill:' + name),
    click: async () => act('click:' + name),
  });
  const page = {
    goto: async () => act('goto'),
    waitForURL: async () => act('waitURL'),
    getByRole: (_role: string, options: { name: string }) =>
      locator(options.name),
    getByLabel: locator,
    getByText: locator,
  } as unknown as Page;
  const client = {
    auth: {
      setSession: async () => {
        await act('session');
        return { error: null };
      },
    },
  };
  vi.spyOn(session, 'sessionTokensFromPage').mockImplementation(async () => {
    await act('tokens');
    return {
      access_token: 'SYNTHETIC_ACCESS',
      refresh_token: 'SYNTHETIC_REFRESH',
    };
  });
  vi.spyOn(runtime, 'createFunctionalClient').mockReturnValue(
    client as unknown as ReturnType<typeof runtime.createFunctionalClient>,
  );
  vi.spyOn(profiles, 'createProfileRepository').mockReturnValue({
    getMyProfile: async () => {
      await act('profile');
      return {
        id: 'SYNTHETIC_SUBJECT',
        role: controls.badProfile ? 'teacher' : 'student',
        registrationComplete: true,
      };
    },
  } as unknown as ReturnType<typeof profiles.createProfileRepository>);
  vi.spyOn(classrooms, 'createClassroomRepository').mockReturnValue({
    listMine: async () => {
      await act('membership');
      return controls.badMembership ? [] : [{ classroomId: 'SYNTHETIC_CLASS' }];
    },
  } as unknown as ReturnType<typeof classrooms.createClassroomRepository>);
  return {
    writes,
    events,
    controls,
    controller,
    original,
    journal,
    identity,
    client,
    checkpoints: () =>
      writes.filter(
        (row) =>
          row.name !== 'registration-confirmed' &&
          /-(started|confirmed|failed)$/u.test(row.name),
      ),
    run: () =>
      registerFunctionalStudent(
        page,
        fixtures.syntheticScope(),
        identity,
        { classroomId: 'SYNTHETIC_CLASS', joinCode: 'ABCDEFGH' },
        fixtures.syntheticSecrets,
        journal,
        controller.signal,
        {
          beforeLogout: async () => act('observation'),
        } as unknown as Parameters<typeof registerFunctionalStudent>[7],
      ),
  };
};

describe('actual register caller uses every bounded checkpoint', () => {
  it('completes fourteen phases in original order with authoritative profile/membership checks', async () => {
    const h = setup();
    expect(await h.run()).toBe(h.client);
    const records = h
      .checkpoints()
      .map((row) => registrationCheckpointSchema.parse(row.value));
    expect(records.map((row) => [row.phase, row.status])).toEqual(
      registrationPhases.flatMap((phase) => [
        [phase, 'started'],
        [phase, 'confirmed'],
      ]),
    );
    expect(records.map((row) => row.sequence)).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 1),
    );
    expect(h.writes.some((row) => row.name === 'registration-confirmed')).toBe(
      true,
    );
    expect(JSON.stringify(records)).not.toMatch(/SYNTHETIC_|123456/u);
    expect(
      h.events.filter((event) => event.includes('click:傳送驗證碼')),
    ).toHaveLength(1);
    expect(
      h.events.filter((event) => event.includes('click:完成註冊')),
    ).toHaveLength(1);
  });
  it.each(registrationPhases)(
    'stops at the actual %s operation and keeps the public fallback',
    async (phase) => {
      const h = setup();
      h.controls.fail = phase;
      await expect(h.run()).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
      const records = h
        .checkpoints()
        .map((row) => registrationCheckpointSchema.parse(row.value));
      expect(records.at(-1)).toMatchObject({ phase, status: 'failed' });
      expect(
        records.some(
          (row) => row.phase === phase && row.status === 'confirmed',
        ),
      ).toBe(false);
      expect(
        records.every(
          (row) =>
            registrationPhases.indexOf(row.phase) <=
            registrationPhases.indexOf(phase),
        ),
      ).toBe(true);
      expect(JSON.stringify(records)).not.toContain('SYNTHETIC_');
    },
  );
  it.each(['badProfile', 'badMembership'] as const)(
    'keeps original %s denial',
    async (key) => {
      const h = setup();
      h.controls[key] = true;
      await expect(h.run()).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
      expect(h.checkpoints().at(-1)?.value).toMatchObject({
        phase: 'profile_membership',
        status: 'failed',
        code: 'FUNCTIONAL_AUTH_FAILED',
      });
      expect(
        h.writes.some((row) => row.name === 'registration-confirmed'),
      ).toBe(false);
    },
  );
  it.each(['started', 'confirmed'] as const)(
    'a %s journal failure prevents subsequent actions',
    async (status) => {
      const h = setup();
      h.controls.writeFail = `registration-basic-details-${status}`;
      await expect(h.run()).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
      expect(
        h.events.some((event) => event.startsWith('otp_send_action:')),
      ).toBe(false);
      if (status === 'started')
        expect(
          h.events.some((event) => event.startsWith('basic_details:')),
        ).toBe(false);
      expect(
        h.writes.some((row) => row.name === 'registration-confirmed'),
      ).toBe(false);
    },
  );
  it('abort while actual login fill is pending prevents password fill and login click', async () => {
    const h = setup();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.controls.hold = async (event) => {
      if (event === 'post_registration_login:fill:帳號') {
        entered();
        await pending;
      }
    };
    const result = h.run();
    await ready;
    h.controller.abort();
    release();
    await expect(result).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    expect(h.events).not.toContain('post_registration_login:fill:密碼');
    expect(h.events).not.toContain('post_registration_login:click:登入');
    expect(h.checkpoints().at(-1)?.value).toMatchObject({
      phase: 'post_registration_login',
      status: 'failed',
      errorType: 'ABORTED',
    });
  });
  it('snapshot failure yields null without fabricating counts or changing the flow', async () => {
    const h = setup();
    h.controls.badSnapshot = true;
    await h.run();
    expect(
      h
        .checkpoints()
        .every((row) => (row.value as { mail: unknown }).mail === null),
    ).toBe(true);
  });
});

const sink = (rows: unknown[]) => ({
  directory: 'synthetic',
  write: (_name: string, value: unknown) => {
    rows.push(value);
    return Promise.resolve();
  },
});

describe('strict private registration diagnostic family', () => {
  it('failed writer cannot replace the original error or inspect hostile secret properties', async () => {
    const getter = vi.fn(() => {
      throw new Error('SYNTHETIC_SECRET');
    });
    const error = new Error();
    for (const field of ['message', 'name', 'stack', 'cause', 'toJSON'])
      Object.defineProperty(error, field, { get: getter });
    const rows: unknown[] = [];
    const journal = {
      directory: 'synthetic',
      write: vi.fn(async (name: string, value: unknown) => {
        rows.push(value);
        if (name.endsWith('-failed')) throw new Error('SYNTHETIC_WRITER');
        await Promise.resolve();
      }),
    };
    const diagnostics = createRegistrationDiagnostics(
      journal,
      new AbortController().signal,
    );
    let caught: unknown;
    try {
      await diagnostics.step('register_form', () => Promise.reject(error));
    } catch (value) {
      caught = value;
    }
    expect(caught).toBe(error);
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(rows)).not.toContain('SYNTHETIC_');
  });
  it.each([
    [new FunctionalError('FUNCTIONAL_MAIL_FAILED'), 'FUNCTIONAL'],
    [new errors.TimeoutError('SECRET'), 'PLAYWRIGHT_TIMEOUT'],
    [new z.ZodError([]), 'SCHEMA'],
    [0, 'NON_ERROR'],
    [{}, 'UNKNOWN'],
  ] as const)(
    'classifies a fixed error type without raw text',
    async (error, type) => {
      const rows: unknown[] = [];
      const diagnostics = createRegistrationDiagnostics(
        sink(rows),
        new AbortController().signal,
      );
      let caught: unknown;
      try {
        const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);
        await diagnostics.step('register_form', operation);
      } catch (value) {
        caught = value;
      }
      expect(caught).toBe(error);
      expect(rows.at(-1)).toMatchObject({ errorType: type, status: 'failed' });
      expect(JSON.stringify(rows)).not.toContain('SECRET');
    },
  );
  it('late operation after abort is failed and repeated phases are rejected', async () => {
    const controller = new AbortController();
    const rows: unknown[] = [];
    let release!: () => void;
    const diagnostics = createRegistrationDiagnostics(
      sink(rows),
      controller.signal,
    );
    const operation = diagnostics.step(
      'register_form',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await vi.waitFor(() => {
      expect(release).toBeTypeOf('function');
    });
    controller.abort();
    release();
    await expect(operation).rejects.toBe(controller.signal.reason);
    expect(rows.at(-1)).toMatchObject({
      status: 'failed',
      errorType: 'ABORTED',
    });
    expect(
      rows.some((row) => (row as { status: string }).status === 'confirmed'),
    ).toBe(false);
    const other = createRegistrationDiagnostics(
      { directory: 'synthetic', write: () => Promise.resolve() },
      new AbortController().signal,
    );
    await other.step('register_form', () => Promise.resolve());
    await expect(
      other.step('register_form', () => Promise.resolve()),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
  });
  it('does not invoke accessors or toJSON on a malformed mailbox snapshot', async () => {
    const getter = vi.fn(() => {
      throw new Error('SECRET');
    });
    const malformed = { ...safeMail() };
    Object.defineProperty(malformed, 'reason', { get: getter });
    const rows: unknown[] = [];
    const diagnostics = createRegistrationDiagnostics(
      sink(rows),
      new AbortController().signal,
      { mail: () => malformed },
    );
    await diagnostics.step('register_form', () => Promise.resolve());
    expect(getter).not.toHaveBeenCalled();
    expect(rows.at(-1)).toMatchObject({ mail: null });
  });
  it('uses real private writer names, permissions and immutable files', async () => {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'm22-')));
    await fs.chmod(root, 0o700);
    try {
      const runId = fixtures.syntheticScope().runId;
      const journal = await createPrivateJournal(root, runId);
      const diagnostics = createRegistrationDiagnostics(
        journal,
        new AbortController().signal,
      );
      for (const phase of registrationPhases)
        await diagnostics.step(phase, () =>
          Promise.resolve({
            secret: 'SYNTHETIC_SECRET',
          }),
        );
      expect((await fs.stat(journal.directory)).mode & 0o777).toBe(0o700);
      const files = await fs.readdir(journal.directory);
      expect(files).toHaveLength(28);
      for (const file of files) {
        expect(
          (await fs.stat(join(journal.directory, file))).mode & 0o777,
        ).toBe(0o600);
        const raw = await fs.readFile(join(journal.directory, file), 'utf8');
        registrationCheckpointSchema.parse(JSON.parse(raw));
        expect(raw).not.toContain('SYNTHETIC_');
      }
      await expect(
        journal.write('registration-register-form-started', {}),
      ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
