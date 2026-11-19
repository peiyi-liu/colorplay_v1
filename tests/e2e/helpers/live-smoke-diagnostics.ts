import { performance } from 'node:perf_hooks';
import type { Page, Request, Response, WebSocket } from '@playwright/test';
import {
  decodeSafeRealtimeFrame,
  liveFrameTopic,
} from './live-connection-diagnostics';
import {
  own,
  numeric,
  publicState,
  binaryTopic,
  projectLiveSmokeUi,
  classifyLiveSmokeRequest,
  createLiveSmokeAck,
  callbackHeaderSpan,
  type Role,
  type Topic,
  type Operation,
  type Event,
  type SmokeObservationData,
} from './live-smoke-diagnostic-projections';
interface Actor extends SmokeObservationData<Request> {
  page: Page;
  remove: (() => void)[];
}
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
/** Test-side observation only. Callback clocks and browser order never confer authority. */
export const createLiveSmokeDiagnostics = (
  appUrl: string,
  apiUrl: string,
  write: (line: string) => void = (line) => {
    console.log(line);
  },
  now: () => number = () => performance.now(),
) => {
  const actors = new Map<Role, Actor>(),
    pending = new Set<Promise<unknown>>();
  const markers: [number | null, string][] = [];
  let accepting = true,
    sealed = false,
    fault = false,
    failure = false;
  let session: string | undefined,
    origin: number | undefined,
    last = -Infinity;
  let origins: string[] = [],
    ui: unknown = null,
    trace: unknown = null;
  let finishing: Promise<void> | undefined,
    failureUi: Promise<unknown> | undefined;
  try {
    origins = [new URL(appUrl).origin, new URL(apiUrl).origin];
  } catch {
    fault = true;
  }
  const safe = (action: () => void): undefined => {
    if (!sealed) {
      try {
        action();
      } catch {
        fault = true;
      }
    }
    return undefined;
  };
  const clock = () => {
    const value = now();
    if (!Number.isFinite(value) || value < last || value < 0) {
      fault = true;
      return null;
    }
    last = value;
    origin ??= value;
    return value - origin;
  };
  const bind = (role: Role, page: Page) => {
    const url = new URL(page.url());
    const match = /^\/(teacher|app)\/live\/([a-f0-9-]{36})$/iu.exec(
      url.pathname,
    );
    if (
      url.origin !== origins[0] ||
      !match?.[2] ||
      !uuid.test(match[2]) ||
      match[1] !== (role === 'HOST' ? 'teacher' : 'app')
    )
      return undefined;
    const id = match[2].toLowerCase();
    if (role === 'HOST') session ??= id;
    return id === session ? id : undefined;
  };
  const row = (
    a: Actor,
    event: Event,
    op: Operation | Topic,
    status: number | null = null,
    lineage: readonly [number, number] | null = null,
  ) => {
    if (a.rows.length >= 64) {
      a.drops++;
      fault = true;
      return;
    }
    a.rows.push([clock(), event, op, status, lineage]);
  };
  const track = (task: Promise<unknown>) => {
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
  };
  const attach = async (role: Role, page: Page) => {
    if (sealed || !accepting || actors.has(role)) {
      fault = true;
      return;
    }
    const a: Actor = {
      page,
      rows: [],
      headerCallbackSpans: [],
      drops: 0,
      sockets: 0,
      stateEpoch: 0,
      remove: [],
      requests: new Map(),
      state: null,
    };
    actors.set(role, a);
    const operation = (req: Request) =>
      classifyLiveSmokeRequest(req.url(), req.method(), origins);
    const request = (req: Request) => {
      safe(() => {
        if (!accepting) return;
        const op = operation(req);
        if (!op) return;
        bind(role, page);
        if (a.requests.has(req) || a.requests.size >= 64) {
          fault = true;
          a.drops++;
          return;
        }
        a.requests.set(req, { op, started: clock(), responded: false });
        row(a, 'REQUEST', op);
      });
    };
    const response = (res: Response) => {
      safe(() => {
        const req = res.request(),
          record = a.requests.get(req);
        if (!record) return;
        if (record.responded) {
          fault = true;
          return;
        }
        record.responded = true;
        const status = numeric(res.status(), 599);
        if (status < 100) throw Error();
        row(a, 'RESPONSE', record.op, status);
        a.headerCallbackSpans.push(callbackHeaderSpan(record.started, clock()));
        if (role === 'HOST' && record.op === 'STATE') {
          a.state = null;
          a.stateEpoch++;
        }
        // Only Host JSON creates asynchronous body work; student fixture ownership stays unchanged.
        if (role === 'HOST' && record.op === 'STATE' && status === 200) {
          const expected = bind(role, page),
            epoch = a.stateEpoch;
          const task = res.json().then(
            (body: unknown) => {
              safe(() => {
                if (epoch === a.stateEpoch)
                  a.state = publicState(body, expected);
              });
            },
            () => {
              fault = true;
            },
          );
          track(task);
        }
      });
    };
    const failed = (req: Request) => {
      safe(() => {
        const record = a.requests.get(req);
        if (record) {
          record.responded = true;
          row(a, 'FAILED', record.op);
        }
      });
    };
    const websocket = (socket: WebSocket) => {
      safe(() => {
        if (!accepting) return;
        const url = new URL(socket.url());
        if (
          url.origin.replace(/^ws/u, 'http') !== origins[1] ||
          url.pathname !== '/realtime/v1/websocket'
        )
          return;
        if (a.sockets >= 8) {
          fault = true;
          a.drops++;
          return;
        }
        const generation = ++a.sockets,
          ack = createLiveSmokeAck();
        const frame = (input: unknown, sent: boolean) => {
          safe(() => {
            if (!accepting || generation !== a.sockets) return;
            const raw = own(input).payload;
            const expected = bind(role, page);
            if (!expected) {
              row(a, 'UNKNOWN', 'UNKNOWN');
              return;
            }
            if (
              !(typeof raw === 'string' || Buffer.isBuffer(raw)) ||
              Buffer.byteLength(raw) > 65536
            )
              throw Error();
            if (Buffer.isBuffer(raw) && raw[0] === 4) {
              const topic = binaryTopic(raw, expected);
              if (topic) row(a, 'BINARY_BROADCAST', topic);
              return;
            }
            const decoded = decodeSafeRealtimeFrame(raw);
            if (!decoded) return;
            const topic = liveFrameTopic(decoded, expected);
            if (!topic) {
              if (decoded.isLiveTopic) {
                fault = true;
                row(a, 'UNKNOWN', 'UNKNOWN');
              }
              return;
            }
            const observed = ack.observe(
              sent,
              decoded.event,
              decoded.ref,
              topic.joinRef,
              topic.kind,
              decoded.replyStatus,
            );
            if (observed) {
              if (observed.event === 'UNKNOWN') fault = true;
              row(a, observed.event, topic.kind, null, [
                generation,
                observed.group,
              ]);
            }
          });
        };
        const sent = (value: unknown) => {
            frame(value, true);
          },
          received = (value: unknown) => {
            frame(value, false);
          };
        const close = () => {
          safe(() => {
            if (accepting && generation === a.sockets)
              row(a, 'CLOSED', 'UNKNOWN', null, [generation, ack.close()]);
          });
        };
        socket.on('framesent', sent);
        socket.on('framereceived', received);
        socket.on('close', close);
        a.remove.push(() => {
          socket.off('framesent', sent);
          socket.off('framereceived', received);
          socket.off('close', close);
          ack.clear();
        });
      });
    };
    safe(() => {
      page.on('request', request);
      a.remove.push(() => {
        page.off('request', request);
      });
      page.on('response', response);
      a.remove.push(() => {
        page.off('response', response);
      });
      page.on('requestfailed', failed);
      a.remove.push(() => {
        page.off('requestfailed', failed);
      });
      page.on('websocket', websocket);
      a.remove.push(() => {
        page.off('websocket', websocket);
      });
    });
    if (role === 'HOST') {
      try {
        await page.addInitScript(() => {
          if (
            !Object.getOwnPropertyDescriptor(
              window,
              '__colorplayCapacityRealtime',
            )
          )
            Object.defineProperty(window, '__colorplayCapacityRealtime', {
              value: { liveTrace: { v: 1 } },
              writable: false,
              configurable: false,
            });
        });
      } catch {
        fault = true;
      }
    }
  };
  const mark = (
    stage: 'LAUNCH' | 'JOIN' | 'WAITING_VISIBLE' | 'ROSTER_ASSERT',
  ) => {
    safe(() => {
      if (accepting && markers.length < 8) markers.push([clock(), stage]);
    });
  };
  const stopAdmission = () => {
    accepting = false;
  };
  const captureFailure = () => {
    safe(() => {
      if (failure) return;
      failure = true;
      const host = actors.get('HOST');
      if (!host) {
        fault = true;
        return;
      }
      const task = host.page
        .evaluate(() => {
          const presenter = document.querySelector(
            '[aria-label="Live 投影模式"]',
          );
          const header = presenter?.querySelector(
            '[aria-label="Live 課堂狀態"]',
          );
          const text =
            header?.querySelector('.live-projector__metric:last-child strong')
              ?.textContent ?? '';
          const visible = (node: Element | null | undefined) =>
            !!node &&
            node.getClientRects().length > 0 &&
            getComputedStyle(node).visibility !== 'hidden';
          const countNode = header?.querySelector(
            '.live-projector__metric:last-child strong',
          );
          const count = /^已加入 (\d+) 人$/u.exec(text.trim());
          const parent = Object.getOwnPropertyDescriptor(
            window,
            '__colorplayCapacityRealtime',
          )?.value as unknown;
          const slot =
            parent && typeof parent === 'object'
              ? (Object.getOwnPropertyDescriptor(parent, 'liveTrace')
                  ?.value as unknown)
              : undefined;
          const q: unknown =
            slot && typeof slot === 'object'
              ? Object.getOwnPropertyDescriptor(slot, 'q')?.value
              : undefined;
          return {
            presenter: !!presenter,
            presenterVisible: visible(presenter),
            phase: presenter?.getAttribute('data-projector-phase') ?? 'UNKNOWN',
            header: !!header,
            headerVisible: visible(header),
            countVisible: visible(countNode),
            count: count ? Number(count[1]) : null,
            connection:
              document
                .querySelector('[aria-label="主持人連線狀態"] [data-state]')
                ?.getAttribute('data-state') ?? 'UNKNOWN',
            error: !!document.querySelector(
              '.teacher-live-session-page [role="alert"]',
            ),
            trace: typeof q === 'string' && q.length <= 768 ? q : null,
          };
        })
        .then(
          (raw: unknown) => {
            safe(() => {
              const value = projectLiveSmokeUi(raw);
              ui = value.view;
              trace = value.trace;
            });
          },
          () => {
            fault = true;
          },
        );
      failureUi = task;
      track(task);
    });
  };
  const finish = (
    closeTeacher: () => Promise<unknown>,
    primaryFailed: boolean,
  ) =>
    (finishing ??= (async () => {
      stopAdmission();
      if (failureUi) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            failureUi,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 200);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }
      for (const a of actors.values())
        for (const remove of a.remove) {
          try {
            remove();
          } catch {
            fault = true;
          }
        }
      let closeFailed = false,
        closeError: unknown;
      try {
        await closeTeacher();
      } catch (error) {
        closeFailed = true;
        closeError = error;
        fault = true;
      }
      if (!closeFailed)
        while (pending.size) await Promise.allSettled([...pending]);
      if (
        [...actors.values()].some((a) =>
          [...a.requests.values()].some((r) => !r.responded),
        )
      )
        fault = true;
      const result = {
        schemaVersion: 1,
        authority: 'NONE',
        clock: 'NODE_CALLBACK',
        collection:
          actors.size === 0 ? 'UNOBSERVED' : fault ? 'PARTIAL' : 'OBSERVED',
        failureObserved: failure,
        admissionClosed: true,
        drained: !closeFailed && pending.size === 0,
        pendingAtSeal: pending.size,
        teacherClosed: closeFailed ? 'UNKNOWN' : 'OBSERVED',
        markers,
        actors: [...actors].map(([role, a]) => ({
          role,
          socketGenerations: a.sockets,
          events: a.rows,
          headerCallbackSpans: a.headerCallbackSpans,
          dropped: a.drops,
          publicState: role === 'HOST' ? a.state : null,
          stateCollection:
            role === 'STUDENT'
              ? 'UNOBSERVED_HOST_ONLY_JSON'
              : a.state
                ? 'OBSERVED'
                : 'UNOBSERVED',
        })),
        ui: {
          collection: ui ? 'OBSERVED' : failure ? 'UNAVAILABLE' : 'UNOBSERVED',
          view: ui,
        },
        applicationStateSchema: 'UNOBSERVED_FIELDS_ONLY',
        cacheParticipantCount: 'UNOBSERVED',
        trace: trace ?? { collection: 'UNOBSERVED' },
      };
      sealed = true;
      for (const a of actors.values()) {
        a.requests.clear();
        a.remove.length = 0;
      }
      actors.clear();
      session = undefined;
      const line = JSON.stringify(result);
      try {
        write(
          'LIVE_SMOKE_DIAGNOSTICS ' +
            (Buffer.byteLength(line) <= 32768
              ? line
              : JSON.stringify({
                  schemaVersion: 1,
                  authority: 'NONE',
                  collection: 'PARTIAL',
                  overflow: true,
                  drained: !closeFailed && pending.size === 0,
                  pendingAtSeal: pending.size,
                  teacherClosed: 'UNKNOWN',
                })),
        );
      } catch {
        /* Observation cannot change the original test verdict. */
      }
      if (closeFailed && !primaryFailed) throw closeError;
    })());
  return { attach, mark, stopAdmission, captureFailure, finish };
};
