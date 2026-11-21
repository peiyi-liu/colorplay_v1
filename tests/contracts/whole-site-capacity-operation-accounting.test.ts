import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, it } from 'vitest';
import {
  createCapacityOperationObserver,
  capacityOperationEndpoints,
} from '../../scripts/concurrency/capacity-operation-observer';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  capacityOperationAccountingSchema,
  createCapacityOperationAccounting,
} from '../../scripts/concurrency/capacity-game-diagnostics';

const fixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof);
  const cdp = Object.assign(new EventEmitter(), {
    send: () => Promise.resolve(undefined),
    detach: () => Promise.resolve(undefined),
  });
  const observer = await createCapacityOperationObserver(
    scope,
    { newCDPSession: () => Promise.resolve(cdp) } as unknown as BrowserContext,
    { isClosed: () => false } as Page,
    0,
    new AbortController().signal,
    () => 'op-000001',
    () => true,
  );
  let index = 0;
  const request = (operation: keyof typeof capacityOperationEndpoints) => {
    const requestId = `private-${String(index++)}`;
    cdp.emit('Network.requestWillBeSent', {
      requestId,
      timestamp: index,
      request: {
        url: `${scope.supabaseUrl}/rest/v1/rpc/${capacityOperationEndpoints[operation][0] ?? ''}`,
        method: 'POST',
      },
    });
    cdp.emit('Network.responseReceived', {
      requestId,
      response: { status: 200 },
    });
    cdp.emit('Network.loadingFinished', { requestId, timestamp: index + 0.1 });
  };
  return { cdp, observer, request };
};
it('actual callback decomposes 52 physical /22 unattributed without changing the authoritative counts', async () => {
  const f = await fixture();
  for (let i = 0; i < 22; i++)
    f.request(i % 2 ? 'submit_answer' : 'teacher_dashboard');
  for (const operation of Object.keys(
    capacityOperationEndpoints,
  ) as (keyof typeof capacityOperationEndpoints)[])
    await f.observer.run(operation, 'warm', async () => {
      await Promise.resolve();
      for (let i = 0; i < 6; i++) f.request(operation);
    });
  expect(f.observer.snapshot()).toMatchObject({
    physicalRequests: 52,
    unattributedRequests: 22,
    available: true,
  });
  expect(f.observer.diagnostics()).toMatchObject({
    collection: 'OBSERVED',
    authority: 'NON_AUTHORITY',
    sealed: true,
  });
  const snapshot = f.observer.diagnostics();
  expect(snapshot.rows.reduce((n, row) => n + row.total, 0)).toBe(52);
  expect(snapshot.rows.reduce((n, row) => n + row.attributed, 0)).toBe(30);
  expect(snapshot.rows.reduce((n, row) => n + row.unattributed, 0)).toBe(22);
  for (const row of snapshot.rows) {
    expect(row.attributed).toBe(6);
    expect(row.total).toBe(row.active.reduce((n, cell) => n + cell.count, 0));
    expect(row.unattributed).toBe(
      ['submit_answer', 'teacher_dashboard'].includes(row.operation) ? 11 : 0,
    );
  }
  expect(JSON.stringify(snapshot)).not.toMatch(
    /private|requestId|https?:|secret/,
  );
  expect(Object.isFrozen(snapshot.rows[0]?.active)).toBe(true);
  await f.observer.dispose();
  expect(f.observer.diagnostics()).toEqual(snapshot);
});

it('cross-counts a different active operation without hiding the original unmatched request', async () => {
  const f = await fixture();
  await f.observer.run('published_content', 'cold', async () => {
    await Promise.resolve();
    f.request('submit_answer');
    f.request('published_content');
  });
  const row = f.observer
    .diagnostics()
    .rows.find((r) => r.operation === 'submit_answer');
  expect(row).toMatchObject({ total: 1, attributed: 0, unattributed: 1 });
  expect(
    row?.active.find((r) => r.operation === 'published_content')?.count,
  ).toBe(1);
  expect(f.observer.snapshot()).toMatchObject({
    physicalRequests: 2,
    unattributedRequests: 1,
    available: true,
  });
  await f.observer.dispose();
});
it('malformed and saved late callback remain unavailable and cannot mutate a sealed proof', async () => {
  const f = await fixture();
  const callback = f.cdp.listeners('Network.requestWillBeSent')[0];
  f.request('leaderboard');
  const sealed = f.observer.diagnostics();
  await f.observer.dispose();
  callback?.({
    requestId: 'late',
    timestamp: 1,
    request: { url: 'https://foreign.invalid', method: 'GET' },
  });
  expect(f.observer.diagnostics().collection).toBe('UNAVAILABLE');
  expect(sealed.collection).toBe('OBSERVED');
  const bad = await fixture();
  bad.cdp.emit('Network.requestWillBeSent', { request: null });
  expect(bad.observer.diagnostics().collection).toBe('UNAVAILABLE');
  await bad.observer.dispose();
});
it('bounds the counter projection while leaving its terminal state closed and immutable', () => {
  const accounting = createCapacityOperationAccounting();
  for (let i = 0; i < 1000001; i++) accounting.note('submit_answer', null);
  const result = accounting.seal();
  expect(result).toMatchObject({ overflow: true, collection: 'UNAVAILABLE' });
  expect(result.rows.find((r) => r.operation === 'submit_answer')?.total).toBe(
    1000000,
  );
  expect(capacityOperationAccountingSchema.safeParse(result).success).toBe(
    true,
  );
});

import { captureCapacityOperationAccounting } from '../../scripts/concurrency/capacity-game-diagnostics';
it('missing legacy/custom diagnostics stay unobserved; broken/unknown ports do not replace close', () => {
  expect(captureCapacityOperationAccounting({}).collection).toBe('UNOBSERVED');
  expect(
    captureCapacityOperationAccounting({
      diagnostics: () => {
        throw Error('SECRET');
      },
    }).collection,
  ).toBe('UNAVAILABLE');
  expect(
    captureCapacityOperationAccounting({
      diagnostics: () => ({ collection: 'OBSERVED' }),
    }).collection,
  ).toBe('UNAVAILABLE');
});

const required = <T>(values: readonly T[], index: number): T => {
  const value = values[index];
  if (value === undefined) throw Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};
it.each([
  'TOTAL',
  'OP_DUPLICATE',
  'ACTIVE_DUPLICATE',
  'ATTRIBUTION',
  'CROSS_SUM',
] as const)(
  'actual capture preserves genuine proof and rejects %s matrix',
  (corruption) => {
    const accounting = createCapacityOperationAccounting(0);
    accounting.note('published_content', 'published_content');
    accounting.note('published_content', 'teacher_dashboard');
    const genuine = accounting.seal();
    expect(
      captureCapacityOperationAccounting({ diagnostics: () => genuine }),
    ).toEqual(genuine);
    const bad = structuredClone(genuine),
      row = required(bad.rows, 0);
    if (corruption === 'TOTAL') row.total = 10;
    if (corruption === 'OP_DUPLICATE')
      required(bad.rows, 1).operation = row.operation;
    if (corruption === 'ACTIVE_DUPLICATE')
      required(row.active, 1).operation = required(row.active, 0).operation;
    if (corruption === 'ATTRIBUTION') {
      row.attributed = 0;
      row.unattributed = 2;
    }
    if (corruption === 'CROSS_SUM') required(row.active, 4).count = 0;
    expect(
      captureCapacityOperationAccounting({ diagnostics: () => bad }).collection,
    ).toBe('UNAVAILABLE');
  },
);
