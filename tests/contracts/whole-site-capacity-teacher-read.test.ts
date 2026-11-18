import { afterEach, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type { CapacityGameActor } from '../../scripts/concurrency/capacity-live-game';
import { readCapacityTeacherDuringLoad } from '../../scripts/concurrency/capacity-game';
import { createCapacityGameDiagnostics } from '../../scripts/concurrency/capacity-game-diagnostics';
const pending = new Set<{
  ready(): boolean;
  resolve(): void;
  reject(error: unknown): void;
}>();
class PublicLocator {
  constructor(readonly query: () => Element[]) {}
  locator(selector: string) {
    return new PublicLocator(() =>
      this.query().flatMap((node) =>
        selector === '..'
          ? node.parentElement
            ? [node.parentElement]
            : []
          : Array.from(node.querySelectorAll(selector)),
      ),
    );
  }
  filter(options: { hasText: RegExp }) {
    return new PublicLocator(() =>
      this.query().filter((node) =>
        options.hasText.test(node.textContent ?? ''),
      ),
    );
  }
  wait(predicate: (node: Element) => boolean) {
    const ready = () => {
      const nodes = this.query();
      return (
        nodes.length === 1 && nodes[0] !== undefined && predicate(nodes[0])
      );
    };
    if (ready()) return Promise.resolve();
    return new Promise<void>((resolve, reject) =>
      pending.add({ ready, resolve, reject }),
    );
  }
}
vi.mock('@playwright/test', async (load) => {
  const actual = await load<typeof import('@playwright/test')>();
  return {
    ...actual,
    expect: (value: unknown) =>
      value instanceof PublicLocator
        ? {
            toBeVisible: () => value.wait((node) => !node.closest('[hidden]')),
            toHaveValue: (expected: string) =>
              value.wait(
                (node) => (node as HTMLSelectElement).value === expected,
              ),
            toHaveText: (expected: RegExp) =>
              value.wait((node) => expected.test(node.textContent ?? '')),
          }
        : actual.expect(value),
  };
});
const protocolRead = vi.hoisted(() =>
  vi.fn<
    (classroomId: string, filters: Record<string, never>) => Promise<unknown>
  >(() => Promise.resolve({})),
);
vi.mock(
  '../../src/features/teacher-content/api/teacher-content-repository',
  () => ({
    createTeacherContentRepository: () => ({
      getClassroomOverview: protocolRead,
    }),
  }),
);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const fixture = () => {
  const trace: string[] = [],
    signal = new AbortController();
  const render = (selected = 'requested', panel = 'loading', count = '0/0') => {
    document.body.innerHTML = `<h1>教學分析</h1><details><summary>分析篩選</summary><label for="classroom">選擇班級</label><select id="classroom"><option value="requested">Requested</option><option value="foreign">Foreign</option></select></details>${panel === 'success' ? `<section aria-label="班級總覽"><dl><div><dt>完成人數</dt><dd>${count}</dd></div><div><dt>平均正確率</dt><dd>—</dd></div></dl></section>` : panel === 'error' ? '<div role="alert">班級總覽暫時無法取得。</div>' : '<p role="status">班級總覽載入中…</p>'}`;
    const select = document.querySelector('select');
    if (select) select.value = selected;
    for (const row of [...pending])
      if (row.ready()) {
        pending.delete(row);
        row.resolve();
      }
  };
  render();
  const page = {
    goto: vi.fn((url: string) => {
      expect(url).toBe('/teacher?classroomId=requested');
      trace.push('GOTO');
      return Promise.resolve(null);
    }),
    getByLabel: (name: string, options: { exact: boolean }) => {
      expect([name, options.exact]).toEqual(['選擇班級', true]);
      return new PublicLocator(() =>
        Array.from(document.querySelectorAll('label'))
          .filter((node) => node.textContent === name)
          .flatMap((node) => {
            const target = document.getElementById(node.htmlFor);
            return target ? [target] : [];
          }),
      );
    },
    getByRole: (role: string, options: { name: string; exact: boolean }) => {
      expect(options.exact).toBe(true);
      return new PublicLocator(() =>
        Array.from(
          document.querySelectorAll(
            role === 'heading' ? 'h1' : 'section[aria-label]',
          ),
        ).filter((node) =>
          role === 'heading'
            ? node.textContent === options.name
            : node.getAttribute('aria-label') === options.name,
        ),
      );
    },
  };
  const measure =
    vi.fn<(...args: Parameters<CapacityGameActor['measure']>) => void>();
  const actor: CapacityGameActor = {
    actorIndex: 0,
    client: {} as SupabaseClient<Database>,
    page: page as unknown as Page,
    measure: (op, cache, action, retry, replay) => {
      measure(op, cache, action, retry, replay);
      trace.push('MEASURE');
      return action();
    },
  };
  const expire = (error: unknown) => {
    for (const row of pending) row.reject(error);
    pending.clear();
  };
  return { actor, page, measure, trace, signal, render, expire };
};
afterEach(() => {
  pending.clear();
  document.body.innerHTML = '';
  protocolRead.mockClear();
});
it('actual teacher caller does not admit the next read while the first overview data is deferred', async () => {
  const f = fixture();
  let returned = false;
  const run = readCapacityTeacherDuringLoad(
    f.actor,
    'requested',
    () => true,
    f.signal.signal,
  ).then(() => {
    returned = true;
  });
  try {
    await flush();
    expect(returned).toBe(false);
    expect(f.measure).toHaveBeenCalledTimes(1);
  } finally {
    f.render('requested', 'success', '0/0');
    await run;
  }
  expect(returned).toBe(true);
  expect(f.measure).toHaveBeenCalledTimes(30);
  expect(f.page.goto).toHaveBeenCalledTimes(30);
});
it.each(['0/0', '0/30', '12/40'])(
  'accepts public numeric completion %s and legal unavailable average for all thirty iterations',
  async (count) => {
    const f = fixture();
    f.render('requested', 'success', count);
    let checks = 0;
    f.actor.observed = () => f.measure.mock.calls.length > 0;
    await readCapacityTeacherDuringLoad(
      f.actor,
      'requested',
      () => {
        checks++;
        return true;
      },
      f.signal.signal,
    );
    expect(checks).toBe(60);
    expect(f.measure).toHaveBeenCalledTimes(30);
    expect(f.measure.mock.calls.map((args) => args[1])).toEqual([
      'cold',
      ...Array.from({ length: 29 }, () => 'warm'),
    ]);
    expect(
      f.measure.mock.calls.every(
        (args) => args[0] === 'teacher_dashboard' && args[3] === true,
      ),
    ).toBe(true);
    expect(f.page.goto.mock.calls).toEqual(
      Array.from({ length: 30 }, () => ['/teacher?classroomId=requested']),
    );
  },
);
it.each([
  ['wrong classroom', 'foreign', 'success', '1/2'],
  ['loading', 'requested', 'loading', '0/0'],
  ['error panel', 'requested', 'error', '0/0'],
  ['null overview', 'requested', 'success', '—'],
  ['empty number', 'requested', 'success', ''],
  ['noninteger', 'requested', 'success', '1.5/2'],
  ['negative', 'requested', 'success', '-1/2'],
] as const)(
  'does not treat %s as completed UI; preserves the actual wait exception and MEASURE diagnostics',
  async (_name, selected, panel, count) => {
    const f = fixture();
    f.render(selected, panel, count);
    const sentinel = new TypeError('CONTROLLED_WAIT_FAILURE'),
      diagnostics = createCapacityGameDiagnostics();
    const run = readCapacityTeacherDuringLoad(
      f.actor,
      'requested',
      () => true,
      f.signal.signal,
      diagnostics.observe,
    );
    const rejected = expect(run).rejects.toBe(sentinel);
    await flush();
    expect(f.measure).toHaveBeenCalledTimes(1);
    f.expire(sentinel);
    await rejected;
    expect(
      diagnostics
        .seal()
        .events.filter((row) => row.state === 'FAILED')
        .map((row) => [row.stage, row.errorClass]),
    ).toEqual([['MEASURE', 'TYPE_ERROR']]);
    expect(f.page.goto).toHaveBeenCalledTimes(1);
  },
);
it('rechecks the requested class after the deferred count appears, so a changed selection cannot complete another classroom', async () => {
  const f = fixture(),
    sentinel = Error('CLASS_CHANGED');
  const run = readCapacityTeacherDuringLoad(
    f.actor,
    'requested',
    () => true,
    f.signal.signal,
  );
  const rejected = expect(run).rejects.toBe(sentinel);
  await flush();
  f.render('foreign', 'success', '0/0');
  await flush();
  expect(f.measure).toHaveBeenCalledTimes(1);
  f.expire(sentinel);
  await rejected;
});
it('data becoming ready after the natural student window closes still fails the unchanged AFTER_ACTIVE guard', async () => {
  const f = fixture(),
    diagnostics = createCapacityGameDiagnostics();
  let active = true;
  const run = readCapacityTeacherDuringLoad(
    f.actor,
    'requested',
    () => active,
    f.signal.signal,
    diagnostics.observe,
  );
  const rejected = expect(run).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  await flush();
  active = false;
  f.render('requested', 'success', '0/0');
  await rejected;
  expect(f.measure).toHaveBeenCalledTimes(1);
  expect(diagnostics.seal().events.at(-1)).toMatchObject({
    stage: 'AFTER_ACTIVE',
    state: 'FAILED',
    iteration: 0,
  });
});
it('pre-abort preserves the original refusal before any navigation or UI completion access', async () => {
  const f = fixture();
  f.signal.abort();
  await expect(
    readCapacityTeacherDuringLoad(
      f.actor,
      'requested',
      () => true,
      f.signal.signal,
    ),
  ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  expect(f.page.goto).not.toHaveBeenCalled();
  expect(f.measure).not.toHaveBeenCalled();
});
it('abort while data is deferred never admits another measure after the current public wait completes', async () => {
  const f = fixture();
  const run = readCapacityTeacherDuringLoad(
    f.actor,
    'requested',
    () => true,
    f.signal.signal,
  );
  const rejected = expect(run).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  await flush();
  f.signal.abort();
  f.render('requested', 'success', '0/0');
  await rejected;
  expect(f.measure).toHaveBeenCalledTimes(1);
});
it('page-less protocol fallback keeps thirty original repository calls and no UI completion requirement', async () => {
  const measure =
    vi.fn<(...args: Parameters<CapacityGameActor['measure']>) => void>();
  const actor: CapacityGameActor = {
    actorIndex: 0,
    client: {} as SupabaseClient<Database>,
    measure: (op, cache, action, retry, replay) => {
      measure(op, cache, action, retry, replay);
      return action();
    },
  };
  let checks = 0;
  await readCapacityTeacherDuringLoad(
    actor,
    'requested',
    () => {
      checks++;
      return true;
    },
    new AbortController().signal,
  );
  expect(protocolRead).toHaveBeenCalledTimes(30);
  expect(checks).toBe(60);
  expect(
    protocolRead.mock.calls.every(
      (args) => args[0] === 'requested' && JSON.stringify(args[1]) === '{}',
    ),
  ).toBe(true);
  expect(measure).toHaveBeenCalledTimes(30);
});
