import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import {
  installSendDom,
  sendDomSnapshotSchema,
} from '../../scripts/concurrency/capacity-send-dom';
const setup = () => {
  const doc = {},
    listeners = new Set<(e: Event) => void>();
  let time = 1,
    detached = false,
    disposeFails = false,
    closeFails = false,
    reads = 0;
  class Button {
    ownerDocument = doc;
    isConnected = true;
    contains(target: unknown) {
      return target === this;
    }
    addEventListener(_name: string, callback: (e: Event) => void) {
      listeners.add(callback);
    }
    removeEventListener(_name: string, callback: (e: Event) => void) {
      if (closeFails) throw Error('PRIVATE_CLOSE');
      listeners.delete(callback);
    }
  }
  const node = new Button();
  vi.stubGlobal('HTMLButtonElement', Button);
  vi.stubGlobal('Node', Button);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('performance', { now: () => time });
  const handle = {
    evaluate: vi.fn(async (fn: (value: unknown) => unknown) => {
      await Promise.resolve();
      if (detached) throw Error('PRIVATE_NAVIGATION');
      reads++;
      return fn(memory);
    }),
    dispose: vi.fn(async () => {
      await Promise.resolve();
      if (disposeFails) throw Error('PRIVATE_DISPOSE');
    }),
  };
  let memory: unknown;
  const element = {
    evaluateHandle: vi.fn(async (fn: (node: unknown) => unknown) => {
      await Promise.resolve();
      memory = fn(node);
      return handle;
    }),
    dispose: vi.fn(() => Promise.resolve()),
  };
  const getByRole = vi.fn(() => ({
    elementHandle: () => Promise.resolve(element),
  }));
  const page = { getByRole } as unknown as Page;
  return {
    page,
    node,
    listeners,
    handle,
    element,
    getByRole,
    emit: (trusted = true) => {
      for (const callback of listeners)
        callback({ isTrusted: trusted, target: node } as unknown as Event);
    },
    setTime: (v: number) => {
      time = v;
    },
    navigate: () => {
      node.isConnected = false;
    },
    detach: () => {
      detached = true;
    },
    failClose: () => {
      closeFails = true;
    },
    failDispose: () => {
      disposeFails = true;
    },
    reads: () => reads,
    memory: () => memory,
  };
};
afterEach(() => vi.unstubAllGlobals());
it('actual page-local adapter records only one trusted exact-button click and closes listener and both handles without input reads', async () => {
  const h = setup(),
    lease = await installSendDom(h.page);
  expect(h.getByRole).toHaveBeenCalledWith('button', {
    name: '傳送驗證碼',
    exact: true,
  });
  expect(h.reads()).toBe(0);
  expect(h.listeners.size).toBe(1);
  h.emit(false);
  h.emit();
  const result = await lease.read();
  await lease.close();
  expect(result).toMatchObject({
    collection: 'OBSERVED',
    authority: 'NON_AUTHORITY',
    clock: 'BROWSER_DOCUMENT_PERFORMANCE',
    clickAtMs: [1],
    documentCurrent: true,
    listenerClosed: true,
    handleDisposed: true,
    pending: 0,
  });
  expect(h.listeners.size).toBe(0);
  expect(h.handle.dispose).toHaveBeenCalledOnce();
  expect(h.element.dispose).toHaveBeenCalledOnce();
  expect(await lease.read()).toEqual(result);
  expect(h.reads()).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE_|url|email|password|body/i,
  );
});
it.each([
  'NONE',
  'DUPLICATE',
  'NAVIGATION',
  'CLOCK',
  'OVERFLOW',
  'DETACHED',
  'DISPOSE',
  'CLOSE',
] as const)(
  'does not invent trusted evidence or closure for %s',
  async (kind) => {
    const h = setup(),
      lease = await installSendDom(h.page);
    if (kind === 'DUPLICATE') {
      h.emit();
      h.emit();
    } else if (kind === 'OVERFLOW') {
      for (let i = 0; i < 5; i++) h.emit();
    } else if (kind !== 'NONE') h.emit();
    if (kind === 'NAVIGATION') h.navigate();
    if (kind === 'CLOCK') {
      h.setTime(NaN);
      h.emit();
    }
    if (kind === 'DETACHED') h.detach();
    if (kind === 'DISPOSE') h.failDispose();
    if (kind === 'CLOSE') h.failClose();
    const value = await lease.read();
    await lease.close();
    expect(value.collection).not.toBe('OBSERVED');
    expect(value.pending).toBe(0);
    expect(value.clickAtMs.length).toBeLessThanOrEqual(4);
    if (kind === 'DETACHED' || kind === 'CLOSE')
      expect(value.listenerClosed).toBe(false);
    if (kind === 'DISPOSE') expect(value.handleDisposed).toBe(false);
    expect(JSON.stringify(value)).not.toContain('PRIVATE_');
  },
);
it('missing/throwing install and schema contradictions are unavailable without guessed zero time', async () => {
  const page = {
    getByRole: () => ({
      elementHandle: () => Promise.reject(Error('PRIVATE')),
    }),
  } as unknown as Page;
  const lease = await installSendDom(page);
  await lease.close();
  expect(await lease.read()).toMatchObject({
    collection: 'UNAVAILABLE',
    documentCurrent: null,
    clickAtMs: [],
    pending: 0,
  });
  expect(
    sendDomSnapshotSchema.safeParse({
      ...lease.snapshot(),
      collection: 'OBSERVED',
    }).success,
  ).toBe(false);
});
it('drains a deferred read before disposal instead of abandoning late owned work', async () => {
  const h = setup(),
    lease = await installSendDom(h.page);
  h.emit();
  const original = h.handle.evaluate.getMockImplementation();
  if (!original) throw Error();
  let release: () => void = () => undefined;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  h.handle.evaluate.mockImplementationOnce(async (fn) => {
    await wait;
    return original(fn);
  });
  const read = lease.read(),
    close = lease.close();
  expect(lease.snapshot().pending).toBe(1);
  expect(h.handle.dispose).not.toHaveBeenCalled();
  release();
  await Promise.all([read, close]);
  expect(lease.snapshot()).toMatchObject({
    collection: 'OBSERVED',
    pending: 0,
    listenerClosed: true,
    handleDisposed: true,
  });
});
it('records same-document install anchor and Node call bounds without cross-clock equality', async () => {
  const h = setup(),
    lease = await installSendDom(h.page);
  h.setTime(5);
  h.emit();
  const result = await lease.read();
  expect(result).toMatchObject({
    anchor: { documentAtMs: 1, relation: 'INSTALL_ROUND_TRIP_BOUNDS_ONLY' },
    clickAtMs: [5],
  });
  const raw = Reflect.get(result, 'anchor') as {
    nodeBeforeMs: number;
    nodeAfterMs: number;
  };
  expect(raw.nodeAfterMs).toBeGreaterThanOrEqual(raw.nodeBeforeMs);
  expect(raw.nodeBeforeMs).toBeGreaterThanOrEqual(0);
});

it('close without send performs cleanup without reading the document sample or inventing anchor evidence', async () => {
  const h = setup(),
    lease = await installSendDom(h.page),
    memory = h.memory() as { readAndClose: () => unknown },
    read = vi.spyOn(memory, 'readAndClose');
  await lease.close();
  expect(read).not.toHaveBeenCalled();
  expect(lease.snapshot()).toMatchObject({
    collection: 'UNAVAILABLE',
    clickAtMs: [],
    anchor: { documentAtMs: null },
    listenerClosed: true,
    handleDisposed: true,
    pending: 0,
  });
});
it.each(['BACKWARD', 'MISSING'] as const)(
  'invalid %s Node anchor is unknown rather than mapped to a fake clock',
  async (kind) => {
    const h = setup(),
      times = kind === 'BACKWARD' ? [10, 9] : [NaN, 10],
      lease = await installSendDom(h.page, () => times.shift() ?? NaN);
    h.emit();
    const value = await lease.read();
    expect(value.collection).toBe('UNAVAILABLE');
    expect(value.reason).toBe('CLOCK_INVALID');
    if (kind === 'MISSING') expect(value.anchor.nodeBeforeMs).toBeNull();
  },
);
it('actual tsx-loaded page callback runs in an isolated browser-shaped VM without Node naming helpers', () => {
  const code = `import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';import {installSendDom} from './scripts/concurrency/capacity-send-dom.ts';
 let callback;const element={dispose:async()=>{},evaluateHandle:async fn=>{callback=fn;return {};}};
 await installSendDom({getByRole:()=>({elementHandle:async()=>element})});assert.equal(typeof callback,'function');
 const doc={};class Button{ownerDocument=doc;isConnected=true;listeners=new Set();contains(v){return v===this;}addEventListener(_n,fn){this.listeners.add(fn);}removeEventListener(_n,fn){this.listeners.delete(fn);}}
 const node=new Button();const execute=runInNewContext('('+callback.toString()+')',{HTMLButtonElement:Button,Node:Button,document:doc,performance:{now:()=>10}});
 const memory=execute(node);assert.equal(node.listeners.size,1);for(const listener of node.listeners)listener({isTrusted:true,target:node});const data=memory.readAndClose();assert.equal(data.clickAtMs.length,1);assert.equal(node.listeners.size,0);console.log('SELF_CONTAINED_CALLBACK_PASS');`;
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', code],
    { cwd: process.cwd(), timeout: 15000, maxBuffer: 65536, encoding: 'utf8' },
  );
  expect(output.trim()).toBe('SELF_CONTAINED_CALLBACK_PASS');
});
