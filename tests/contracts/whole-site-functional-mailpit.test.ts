import { describe, expect, it, vi } from 'vitest';
import { createOwnedMailbox } from '../../scripts/concurrency/mailpit';
import { syntheticScope } from './helpers/whole-site-functional';
const address = `${syntheticScope().runId}.synthetic@colorplay.test`;
describe('only owned fresh Mailpit messages', () => {
  it('refuses other addresses before issuing any request', () => {
    const transport = vi.fn<typeof fetch>();
    expect(() =>
      createOwnedMailbox(
        syntheticScope(),
        'other@colorplay.test',
        new AbortController().signal,
        transport,
      ),
    ).toThrow('FUNCTIONAL_MAIL_FAILED');
    expect(transport).not.toHaveBeenCalled();
  });
  it('excludes the before-send mailbox snapshot and only consumes a new exact recipient', async () => {
    let searches = 0;
    const transport = vi.fn<typeof fetch>((input) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.pathname.endsWith('/search'))
        return Promise.resolve(
          Response.json({
            messages:
              searches++ === 0
                ? [{ ID: 'old' }]
                : [{ ID: 'old' }, { ID: 'new' }],
          }),
        );
      expect(url.pathname).toBe('/api/v1/message/new');
      return Promise.resolve(
        Response.json({ Text: '驗證碼：123456', To: [{ Address: address }] }),
      );
    });
    const mailbox = createOwnedMailbox(
      syntheticScope(),
      address,
      new AbortController().signal,
      transport,
    );
    const before = await mailbox.baseline();
    expect(await mailbox.wait(before, 'otp')).toBe('123456');
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('a search mismatch cannot expose someone else’s message', async () => {
    const transport = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        Response.json(
          (typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
          ).includes('/search')
            ? { messages: [{ ID: 'new' }] }
            : {
                Text: 'SYNTHETIC_SECRET 123456',
                To: [{ Address: 'other@colorplay.test' }],
              },
        ),
      ),
    );
    await expect(
      createOwnedMailbox(
        syntheticScope(),
        address,
        new AbortController().signal,
        transport,
      ).wait(new Set(), 'otp'),
    ).rejects.toThrow('FUNCTIONAL_MAIL_FAILED');
  });
  it('malformed payload and raw transport failures produce only fixed safe errors', async () => {
    for (const transport of [
      () =>
        Promise.resolve(
          Response.json({ messages: [{ ID: 'SYNTHETIC_SECRET?bad' }] }),
        ),
      () => Promise.reject(new Error('SYNTHETIC_SECRET')),
    ])
      await expect(
        createOwnedMailbox(
          syntheticScope(),
          address,
          new AbortController().signal,
          transport,
        ).baseline(),
      ).rejects.toThrow('FUNCTIONAL_MAIL_FAILED');
  });
  it('an already aborted run never polls Mailpit', async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<typeof fetch>();
    await expect(
      createOwnedMailbox(
        syntheticScope(),
        address,
        controller.signal,
        transport,
      ).wait(new Set(), 'otp'),
    ).rejects.toThrow('FUNCTIONAL_MAIL_FAILED');
    expect(transport).not.toHaveBeenCalled();
  });
});

import { setTimeout as pause } from 'node:timers/promises';
import { mailboxDiagnosticSchema } from '../../scripts/concurrency/mailpit';
vi.mock('node:timers/promises', () => {
  const sleep = vi.fn(() => Promise.resolve());
  return { setTimeout: sleep, default: { setTimeout: sleep } };
});
const mailboxFor = (
  listing: unknown,
  detail: unknown,
  status = 200,
  listStatus = 200,
) => {
  const transport = vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      (typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      ).includes('/search')
        ? listing instanceof Response
          ? listing
          : Response.json(listing, { status: listStatus })
        : detail instanceof Response
          ? detail
          : Response.json(detail, { status }),
    ),
  );
  const controller = new AbortController();
  const mailbox = createOwnedMailbox(
    syntheticScope(),
    address,
    controller.signal,
    transport,
  );
  const diagnostic = () =>
    mailboxDiagnosticSchema.parse(mailbox.diagnostics?.());
  return { mailbox, transport, controller, diagnostic };
};
describe('closed safe Mailpit snapshots preserve original decisions', () => {
  it('does not issue IO or expose recipient/code/message when reading or mutating a snapshot', async () => {
    const h = mailboxFor(
      { messages: [{ ID: 'new' }] },
      { Text: 'SECRET_BODY 123456', To: [{ Address: address }] },
    );
    const initial = h.diagnostic();
    expect(h.transport).not.toHaveBeenCalled();
    expect(initial.polls).toBe(0);
    expect(initial.otpCount).toBeNull();
    expect(await h.mailbox.wait(new Set(), 'otp')).toBe('123456');
    const before = h.transport.mock.calls.length;
    const observed = h.diagnostic();
    expect(observed).toMatchObject({
      phase: 'OTP_PARSE',
      reason: null,
      polls: 1,
      newMatches: 1,
      recipientExact: true,
      otpCount: 1,
      statusClass: 'OK',
    });
    observed.phase = 'WAIT';
    expect(h.diagnostic().phase).toBe('OTP_PARSE');
    expect(h.transport).toHaveBeenCalledTimes(before);
    expect(JSON.stringify(h.diagnostic())).not.toMatch(
      /123456|SECRET_BODY|@|new"/u,
    );
  });
  it.each([
    [{ messages: [] }, null, 200, 503, 'LIST_HTTP'],
    [{ messages: [{ ID: 'bad?SECRET' }] }, null, 200, 200, 'LIST_SCHEMA'],
    [new Response('{'), null, 200, 200, 'LIST_SCHEMA'],
    [
      { messages: [{ ID: 'new' }, { ID: 'other' }] },
      null,
      200,
      200,
      'MULTIPLE_NEW',
    ],
    [
      { messages: [{ ID: 'new' }] },
      { Text: '123456', To: [{ Address: address }] },
      500,
      200,
      'DETAIL_HTTP',
    ],
    [
      { messages: [{ ID: 'new' }] },
      new Response('{'),
      200,
      200,
      'DETAIL_SCHEMA',
    ],
    [
      { messages: [{ ID: 'new' }] },
      { Text: 0, To: [{ Address: address }] },
      200,
      200,
      'DETAIL_SCHEMA',
    ],
    [
      { messages: [{ ID: 'new' }] },
      { Text: 'SECRET 123456', To: [{ Address: 'foreign@colorplay.test' }] },
      200,
      200,
      'RECIPIENT_MISMATCH',
    ],
    [
      { messages: [{ ID: 'new' }] },
      { Text: '123456', To: [{ Address: address }, { Address: address }] },
      200,
      200,
      'RECIPIENT_MISMATCH',
    ],
    [
      { messages: [{ ID: 'new' }] },
      { Text: 'SECRET no code', To: [{ Address: address }] },
      200,
      200,
      'OTP_COUNT',
    ],
    [
      { messages: [{ ID: 'new' }] },
      { Text: '123456 654321', To: [{ Address: address }] },
      200,
      200,
      'OTP_COUNT',
    ],
  ] as const)(
    'reports safe %s reason without changing rejection',
    async (list, detail, status, listStatus, reason) => {
      const h = mailboxFor(list, detail, status, listStatus);
      await expect(h.mailbox.wait(new Set(), 'otp')).rejects.toThrow(
        'FUNCTIONAL_MAIL_FAILED',
      );
      expect(h.diagnostic().reason).toBe(reason);
      expect(h.transport.mock.calls.length).toBe(
        reason.startsWith('LIST') || reason === 'MULTIPLE_NEW' ? 1 : 2,
      );
      expect(JSON.stringify(h.diagnostic())).not.toMatch(
        /SECRET|123456|654321|@/u,
      );
    },
  );
  it('retains baseline old-ID exclusion and records unique before count', async () => {
    const h = mailboxFor({ messages: [{ ID: 'old' }] }, null);
    const before = await h.mailbox.baseline();
    expect(before).toEqual(new Set(['old']));
    expect(h.diagnostic().baselineCount).toBe(1);
    h.transport.mockImplementation(() =>
      Promise.resolve(Response.json({ messages: [{ ID: 'old' }] })),
    );
    vi.mocked(pause).mockClear();
    await expect(h.mailbox.wait(before, 'otp')).rejects.toThrow(
      'FUNCTIONAL_MAIL_FAILED',
    );
    expect(h.diagnostic()).toMatchObject({
      phase: 'WAIT',
      reason: 'WAIT_EXHAUSTED',
      polls: 30,
      newMatches: 0,
      baselineCount: 1,
    });
    expect(h.transport).toHaveBeenCalledTimes(31);
    expect(pause).toHaveBeenCalledTimes(30);
    expect(vi.mocked(pause).mock.calls.every((args) => args[0] === 1000)).toBe(
      true,
    );
  });
  it('records aborted without a request and keeps recovery URL guard unchanged', async () => {
    const h = mailboxFor({ messages: [] }, null);
    h.controller.abort();
    await expect(h.mailbox.wait(new Set(), 'otp')).rejects.toThrow(
      'FUNCTIONAL_MAIL_FAILED',
    );
    expect(h.diagnostic().reason).toBe('ABORTED');
    expect(h.transport).not.toHaveBeenCalled();
    for (const text of [
      'https://outside.invalid/auth/v1/verify?token=SECRET',
      `${syntheticScope().supabaseUrl}/wrong?token=SECRET`,
    ]) {
      const other = mailboxFor(
        { messages: [{ ID: 'new' }] },
        { Text: text, To: [{ Address: address }] },
      );
      await expect(other.mailbox.wait(new Set(), 'recovery')).rejects.toThrow(
        'FUNCTIONAL_MAIL_FAILED',
      );
      expect(other.diagnostic().reason).toBe('RECOVERY_LINK');
      expect(JSON.stringify(other.diagnostic())).not.toContain('SECRET');
    }
    const link = `${syntheticScope().supabaseUrl}/auth/v1/verify?token=SECRET`;
    const valid = mailboxFor(
      { messages: [{ ID: 'new' }] },
      { Text: link, To: [{ Address: address }] },
    );
    expect(await valid.mailbox.wait(new Set(), 'recovery')).toBe(link);
    expect(valid.diagnostic().phase).toBe('RECOVERY_PARSE');
  });
  it('bounds an excessive OTP count as unknown rather than fabricating zero', async () => {
    const h = mailboxFor(
      { messages: [{ ID: 'new' }] },
      { Text: Array(101).fill('123456').join(' '), To: [{ Address: address }] },
    );
    await expect(h.mailbox.wait(new Set(), 'otp')).rejects.toThrow(
      'FUNCTIONAL_MAIL_FAILED',
    );
    expect(h.diagnostic()).toMatchObject({
      reason: 'OTP_COUNT',
      otpCount: null,
    });
  });
});
