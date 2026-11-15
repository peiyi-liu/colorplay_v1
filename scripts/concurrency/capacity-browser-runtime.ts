import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserServer,
  type Page,
} from '@playwright/test';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import {
  createCapacityProxy,
  capacityProxyArguments,
  type CapacityProxyLease,
} from './capacity-network';
import {
  createCapacityRequestObserver,
  type CapacityRequestObserver,
} from './capacity-request-observer';
export interface NativeCapacityActor {
  actorIndex: number;
  context: BrowserContext;
  page: Page;
  observer: CapacityRequestObserver;
}
export interface NativeCapacityBrowserPorts {
  proxy: (signal: AbortSignal) => Promise<CapacityProxyLease>;
  launchServer: (
    options: NonNullable<Parameters<typeof chromium.launchServer>[0]>,
  ) => Promise<BrowserServer>;
  connect: (endpoint: string) => Promise<Browser>;
}
export const createNativeCapacityBrowser = (
  scope: CapacityScope,
  signal: AbortSignal,
  ports: NativeCapacityBrowserPorts = {
    proxy: (stop) => createCapacityProxy(scope, stop),
    launchServer: (options) => chromium.launchServer(options),
    connect: (endpoint) => chromium.connect(endpoint),
  },
) => {
  requireCapacityScope(scope);
  if (signal.aborted) return capacityFailure();
  let proxy: CapacityProxyLease | null = null,
    server: BrowserServer | null = null,
    browser: Browser | null = null,
    starting: Promise<void> | undefined,
    closing: Promise<void> | undefined,
    stopping = false,
    resourcesClosed = false,
    failed = false,
    popups = 0;
  let serverClosing: Promise<void> | undefined,
    browserClosing: Promise<void> | undefined;
  const contexts = new Set<BrowserContext>(),
    pages = new Set<Page>(),
    observers = new Set<CapacityRequestObserver>(),
    pending = new Set<Promise<unknown>>(),
    actors = new Set<number>();
  const contextClosers = new WeakMap<BrowserContext, Promise<void>>();
  const disposers: (() => void)[] = [];
  const running = () => {
    if (stopping || signal.aborted || failed) return capacityFailure();
  };
  const observe = <T>(operation: () => Promise<T>) => {
    const task = Promise.resolve().then(operation);
    pending.add(task);
    void task.then(
      () => {
        pending.delete(task);
      },
      () => {
        pending.delete(task);
      },
    );
    return task;
  };
  const closeServer = () =>
    server ? (serverClosing ??= server.close()) : Promise.resolve();
  const closeBrowser = () =>
    browser ? (browserClosing ??= browser.close()) : Promise.resolve();
  const closeContext = (context: BrowserContext) => {
    let task = contextClosers.get(context);
    if (!task) {
      task = context.close();
      void task.catch(() => undefined);
      contextClosers.set(context, task);
    }
    return task;
  };
  const start = () => {
    running();
    if (starting) return starting;
    starting = observe(async () => {
      try {
        proxy = await ports.proxy(signal);
        running();
        server = await ports.launchServer({
          host: '127.0.0.1',
          headless: true,
          args: capacityProxyArguments(scope, proxy),
          env: {
            PATH: process.env.PATH ?? '',
            HOME: process.env.HOME ?? '',
            ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
          },
        });
        running();
        const endpoint = new URL(server.wsEndpoint()),
          pid = server.process().pid;
        if (
          endpoint.protocol !== 'ws:' ||
          endpoint.hostname !== '127.0.0.1' ||
          !endpoint.port ||
          endpoint.username ||
          endpoint.password ||
          endpoint.search ||
          !pid ||
          !Number.isInteger(pid) ||
          pid <= 0
        )
          return capacityFailure();
        browser = await ports.connect(endpoint.href);
        running();
      } catch {
        failed = true;
        return capacityFailure();
      }
    });
    return starting;
  };
  const createActor = (actorIndex: number) =>
    observe(async (): Promise<NativeCapacityActor> => {
      running();
      if (
        !browser ||
        !Number.isInteger(actorIndex) ||
        actorIndex < 0 ||
        actorIndex > 59 ||
        actors.has(actorIndex)
      )
        return capacityFailure();
      actors.add(actorIndex);
      const context = await browser.newContext({
        baseURL: scope.appUrl,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
        acceptDownloads: false,
      });
      contexts.add(context);
      const pageListener = (page: Page) => {
        pages.add(page);
        if (context.pages().length > 1) {
          popups++;
          void observe(() => page.close());
        }
      };
      context.on('page', pageListener);
      disposers.push(() => context.off('page', pageListener));
      try {
        running();
        await context.grantPermissions(['local-network-access'], {
          origin: scope.appUrl,
        });
        running();
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        pages.add(page);
        running();
        const observer = await createCapacityRequestObserver(
          scope,
          context,
          page,
          actorIndex,
          signal,
        );
        observers.add(observer);
        running();
        return { actorIndex, context, page, observer };
      } catch {
        failed = true;
        await closeContext(context).catch(() => undefined);
        return capacityFailure();
      }
    });
  const close = () => {
    stopping = true;
    signal.removeEventListener('abort', abort);
    return (closing ??= (async () => {
      const early = [closeBrowser(), closeServer()];
      for (const task of early) void task.catch(() => undefined);
      await starting?.catch(() => undefined);
      const results = await Promise.allSettled([
        ...early,
        closeBrowser(),
        closeServer(),
      ]);
      await Promise.allSettled([...pending]);
      results.push(
        ...(await Promise.allSettled([...contexts].map(closeContext))),
      );
      for (const dispose of disposers) dispose();
      results.push(
        ...(await Promise.allSettled(
          [...observers].map((observer) => observer.dispose()),
        )),
      );
      if (proxy) results.push(...(await Promise.allSettled([proxy.close()])));
      if (
        results.some((result) => result.status !== 'fulfilled') ||
        pending.size !== 0
      )
        return capacityFailure();
      resourcesClosed = true;
    })());
  };
  const abort = () => {
    void close().catch(() => {
      failed = true;
    });
  };
  signal.addEventListener('abort', abort, { once: true });
  return {
    start,
    createActor,
    close,
    identity: () => {
      if (!server?.process().pid) return capacityFailure();
      return { nodePid: process.pid, browserPid: server.process().pid };
    },
    snapshot: () => ({
      mode: 'NATIVE_BROWSER' as const,
      available:
        !failed &&
        !stopping &&
        proxy?.snapshot().available === true &&
        popups === 0,
      contexts: contexts.size,
      pages: pages.size,
      unexpectedPopups: popups,
      resourcesClosed,
      pendingTasks: pending.size,
    }),
  };
};
export type NativeCapacityBrowser = ReturnType<
  typeof createNativeCapacityBrowser
>;
