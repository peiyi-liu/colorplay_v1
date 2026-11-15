import { describe, it, expect, vi } from 'vitest';
import { createCapacityMailbox } from '../../scripts/concurrency/capacity-mailbox';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async () => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof),
    prefix = scope.planId + '.r60.',
    recipients = Array.from(
      { length: 60 },
      (_, i) => prefix + String(i) + '@colorplay.test',
    );
  return { scope, prefix, recipients };
};
describe('one cohort Mailpit coordinator matched v1.30.2 pagination and exact recipient', () => {
  it('collects all60 with bounded pages despite API default50 and keeps every secret private', async () => {
    const h = await setup();
    let sent = false;
    const calls: URL[] = [];
    const transport = vi.fn((input: URL | string) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname === '/api/v1/search') {
        const start = Number(url.searchParams.get('start'));
        return Promise.resolve(
          Response.json({
            messages_count: sent ? 60 : 0,
            start,
            messages: sent
              ? Array.from({ length: Math.min(50, 60 - start) }, (_, i) => ({
                  ID: 'PRIVATE_MAIL_' + String(start + i),
                }))
              : [],
          }),
        );
      }
      const index = Number(url.pathname.split('_').at(-1));
      return Promise.resolve(
        Response.json({
          To: [{ Address: h.recipients[index] }],
          Text: 'code 123456',
        }),
      );
    });
    const mailbox = createCapacityMailbox(
      h.scope,
      { prefix: h.prefix, recipients: h.recipients },
      new AbortController().signal,
      { transport },
    );
    await mailbox.baseline();
    sent = true;
    const codes = await mailbox.wait();
    expect(codes.size).toBe(60);
    expect(
      calls
        .filter((url) => url.pathname === '/api/v1/search')
        .map((url) => url.searchParams.get('start')),
    ).toContain('50');
    expect(calls.every((url) => url.origin === h.scope.mailpitUrl)).toBe(true);
    expect(JSON.stringify(mailbox.snapshot())).not.toMatch(
      /PRIVATE_MAIL|123456|colorplay.test/,
    );
    await mailbox.dispose();
  });
  it.each(['foreign_to', 'duplicate', 'old_only', 'two_codes'] as const)(
    'rejects %s rather than treating found code as completed registration',
    async (failure) => {
      const h = await setup();
      let sent = false;
      let tick = 0;
      const transport = vi.fn((input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/v1/search')
          return Promise.resolve(
            Response.json({
              messages_count: failure === 'duplicate' && sent ? 2 : 1,
              start: 0,
              messages:
                failure === 'duplicate' && sent
                  ? [{ ID: 'NEW_0' }, { ID: 'NEW_1' }]
                  : [
                      {
                        ID:
                          failure === 'old_only'
                            ? 'OLD_ID'
                            : sent
                              ? 'NEW_ID'
                              : 'OLD_ID',
                      },
                    ],
            }),
          );
        return Promise.resolve(
          Response.json({
            To: [
              {
                Address:
                  failure === 'foreign_to'
                    ? 'foreign@colorplay.test'
                    : h.recipients[0],
              },
            ],
            Text: failure === 'two_codes' ? '123456 and 654321' : '123456',
          }),
        );
      });
      const mailbox = createCapacityMailbox(
        h.scope,
        { prefix: h.prefix, recipients: h.recipients },
        new AbortController().signal,
        {
          transport,
          now: () => tick,
          sleep: () => {
            tick += 1000;
            return Promise.resolve();
          },
        },
      );
      await mailbox.baseline();
      sent = true;
      await expect(mailbox.wait()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
      await mailbox.dispose();
    },
  );
});
