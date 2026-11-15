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
