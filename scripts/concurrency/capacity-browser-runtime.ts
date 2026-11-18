import {
  createRegistrationFirstReason,
  registrationPortDiagnostics,
  registrationSnapshot,
} from './capacity-registration-final-diagnostics';
import type { SendPulse } from './capacity-send-diagnostics';
import {
  generatorOperation,
  type GeneratorObserver,
} from './capacity-generator-diagnostics';
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
  getCapacityOnboardingController,
  type CapacityRequestObserver,
} from './capacity-request-observer';
export interface NativeCapacityActor {
  actorIndex: number;
  context: BrowserContext;
  page: Page;
  observer: CapacityRequestObserver;
}
interface SendBinding {
  current(): boolean;
  closed(): boolean;
  subscribe(listener: (value: SendPulse) => void): () => void;
}
const sendBindings = new WeakMap<NativeCapacityActor, SendBinding>();
const onboardingBindings = new WeakMap<
  object,
  {
    app: string;
    current(): boolean;
    control: NonNullable<ReturnType<typeof getCapacityOnboardingController>>;
  }
>();
export const openCapacityOnboardingLogout = (actor: NativeCapacityActor) => {
  const binding = onboardingBindings.get(actor);
  try {
    if (!binding?.current()) return undefined;
    const url = new URL(actor.page.url());
    if (
      url.origin !== binding.app ||
      url.pathname !== '/register' ||
      url.search ||
      url.hash
    ) {
      binding.control.cancel('OWNER');
      return undefined;
    }
    const lease = binding.control.begin();
    if (!lease) return undefined;
    return {
      cancel: () => {
        lease.cancel();
      },
      complete() {
        try {
          const destination = new URL(actor.page.url());
          if (
            !binding.current() ||
            destination.origin !== binding.app ||
            destination.pathname !== '/login' ||
            destination.search ||
            destination.hash
          )
            lease.cancel();
          else lease.complete();
        } catch {
          lease.cancel();
        }
      },
    };
  } catch {
    binding?.control.cancel('OWNER');
    return undefined;
  }
};
export const completeCapacityOnboardingLogin = (actor: NativeCapacityActor) => {
  const binding = onboardingBindings.get(actor);
  try {
    const url = new URL(actor.page.url());
    if (
      binding?.current() &&
      url.origin === binding.app &&
      url.pathname === '/app' &&
      !url.search &&
      !url.hash
    )
      binding.control.loginComplete();
    else binding?.control.cancel('OWNER');
  } catch {
    binding?.control.cancel('OWNER');
  }
};
export const finalizeCapacityOnboardingLogout = (actor: object) => {
  const binding = onboardingBindings.get(actor);
  try {
    if (binding?.current()) binding.control.finalizeCounter();
    else binding?.control.cancel('OWNER');
  } catch {
    binding?.control.cancel('OWNER');
  }
};
export const getNativeCapacitySendBinding = (actor: NativeCapacityActor) => {
  const binding = sendBindings.get(actor);
  return binding?.current() ? binding : undefined;
};
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
  ports?: NativeCapacityBrowserPorts,
  generator?: GeneratorObserver,
) => {
  const diagnostic = createRegistrationFirstReason();
  const nativeSource = ports === undefined;
  const activePorts = ports ?? {
    proxy: (stop: AbortSignal) => createCapacityProxy(scope, stop),
    launchServer: (
      options: NonNullable<Parameters<typeof chromium.launchServer>[0]>,
    ) => chromium.launchServer(options),
    connect: (endpoint: string) => chromium.connect(endpoint),
  };
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
        proxy = await generatorOperation(generator, 'PROXY', null, () =>
          activePorts.proxy(signal),
        );
        running();
        const launchArgs = capacityProxyArguments(scope, proxy);
        server = await generatorOperation(generator, 'LAUNCH', null, () =>
          activePorts.launchServer({
            host: '127.0.0.1',
            headless: true,
            args: launchArgs,
            env: {
              PATH: process.env.PATH ?? '',
              HOME: process.env.HOME ?? '',
              ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
            },
          }),
        );
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
        browser = await generatorOperation(generator, 'CONNECT', null, () =>
          activePorts.connect(endpoint.href),
        );
        running();
      } catch {
        diagnostic.note('STARTUP');
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
      ) {
        diagnostic.note('ACTOR_ADMISSION');
        return capacityFailure();
      }
      const activeBrowser = browser;
      actors.add(actorIndex);
      const context = await generatorOperation(
        generator,
        'CONTEXT',
        actorIndex,
        () =>
          activeBrowser.newContext({
            baseURL: scope.appUrl,
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
            acceptDownloads: false,
          }),
      ).catch((error: unknown) => {
        diagnostic.note('CREATE_ACTOR');
        throw error;
      });
      contexts.add(context);
      const pageListener = (page: Page) => {
        pages.add(page);
        if (context.pages().length > 1) {
          diagnostic.note('POPUP');
          popups++;
          void observe(() => page.close());
        }
      };
      context.on('page', pageListener);
      disposers.push(() => context.off('page', pageListener));
      try {
        running();
        await generatorOperation(generator, 'PERMISSION', actorIndex, () =>
          context.grantPermissions(['local-network-access'], {
            origin: scope.appUrl,
          }),
        );
        running();
        context.setDefaultTimeout(15000);
        const page = await generatorOperation(
          generator,
          'PAGE',
          actorIndex,
          () => context.newPage(),
        );
        pages.add(page);
        running();
        let sendListener: ((value: SendPulse) => void) | undefined;
        const observer = await generatorOperation(
          generator,
          'REQUEST_OBSERVER',
          actorIndex,
          () =>
            createCapacityRequestObserver(
              scope,
              context,
              page,
              actorIndex,
              signal,
              (value) => {
                try {
                  if (sendBindings.get(actor)?.current()) sendListener?.(value);
                } catch {
                  /* Passive only. */
                }
              },
            ),
        );
        observers.add(observer);
        running();
        const actor = { actorIndex, context, page, observer };
        const ownedActor = actor;
        const onboarding = getCapacityOnboardingController(observer);
        if (onboarding)
          onboardingBindings.set(actor, {
            control: onboarding,
            app: scope.appUrl,
            current: () =>
              ownedActor === actor &&
              ownedActor.actorIndex === actorIndex &&
              ownedActor.context === context &&
              ownedActor.page === page &&
              ownedActor.observer === observer &&
              !stopping &&
              !failed &&
              popups === 0 &&
              !signal.aborted &&
              !page.isClosed() &&
              contexts.has(context) &&
              observers.has(observer) &&
              onboarding.isLive(),
          });
        if (nativeSource)
          sendBindings.set(actor, {
            current: () =>
              ownedActor.actorIndex === actorIndex &&
              ownedActor.context === context &&
              ownedActor.page === page &&
              ownedActor.observer === observer &&
              !stopping &&
              popups === 0 &&
              !failed &&
              !signal.aborted &&
              !page.isClosed() &&
              contexts.has(context) &&
              observers.has(observer) &&
              observer.snapshot().available,
            closed: () => resourcesClosed,
            subscribe: (listener) => {
              if (sendListener) throw Error('SEND_LISTENER_DUPLICATE');
              sendListener = listener;
              return () => {
                if (sendListener === listener) sendListener = undefined;
              };
            },
          });
        return actor;
      } catch {
        diagnostic.note('CREATE_ACTOR');
        failed = true;
        await closeContext(context).catch(() => undefined);
        return capacityFailure();
      }
    });
  const close = () => {
    diagnostic.note('STOP');
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
      ) {
        diagnostic.note('CLOSE');
        return capacityFailure();
      }
      resourcesClosed = true;
    })());
  };
  const abort = () => {
    diagnostic.note('ABORT');
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
    snapshot: () =>
      registrationSnapshot(
        {
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
        },
        () => {
          const proxyDiagnostic = registrationPortDiagnostics(proxy);
          return {
            ...diagnostic.snapshot(),
            proxy: {
              collection: proxyDiagnostic.collection,
              firstReason: proxyDiagnostic.firstReason,
            },
          };
        },
      ),
  };
};
export type NativeCapacityBrowser = ReturnType<
  typeof createNativeCapacityBrowser
>;
