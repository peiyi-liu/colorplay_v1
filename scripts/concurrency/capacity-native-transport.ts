import { readFileSync, realpathSync, statSync } from 'node:fs';
import Module from 'node:module';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { BrowserType, Page } from '@playwright/test';
import {
  capacityExecutionProfile,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import type { ColdEntryJournal } from './capacity-cold-entry-diagnostics';
import {
  createTransportDiagnostics,
  installTransportHooks,
  registerTransportClasses,
  transportData,
  transportInstance,
  type TransportClasses,
} from './capacity-transport-diagnostics';
const CORE_SHA =
  '874451b4e7acf90cda4330be42db2259c9e5036c22150f18016f04768434234c';
const PACKAGE_SHA =
  '8243ae9fe675146825391eba8e2b06db88ea5ec94b8291a7394525965f3e7a32';
const APPEND =
  '\n;init_connection();init_frameDispatcher();init_crConnection();init_frame();module.exports=Object.freeze({Connection,Frame:Frame2,FrameDispatcher,CRConnection,playwright:inprocess_exports.playwright});\n';
const sha = (raw: string | Buffer) =>
  createHash('sha256').update(raw).digest('hex');
type PublicBrowser = Pick<BrowserType, 'launchServer' | 'connect'>;
const browserType = (v: unknown): v is PublicBrowser =>
  typeof v === 'object' &&
  v !== null &&
  typeof Reflect.get(v, 'launchServer') === 'function' &&
  typeof Reflect.get(v, 'connect') === 'function';
const need = (value: unknown) => {
  if (!value) throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
};
const loadFactory = () => {
  const file = resolve(
    process.cwd(),
    'node_modules/.pnpm/playwright-core@1.65.1/node_modules/playwright-core/lib/coreBundle.js',
  );
  need(realpathSync(file) === file && statSync(file).size === 3626940);
  need(statSync(resolve(dirname(file), '../package.json')).size === 876);
  const original = readFileSync(file),
    pkg = readFileSync(resolve(dirname(file), '../package.json'));
  need(sha(original) === CORE_SHA && sha(pkg) === PACKAGE_SHA);
  const code = Buffer.concat([original, Buffer.from(APPEND)]),
    compiled = new Module(file);
  const nodePaths: unknown = Reflect.get(Module, '_nodeModulePaths');
  need(typeof nodePaths === 'function');
  if (typeof nodePaths !== 'function')
    throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
  const paths: unknown = Reflect.apply(nodePaths, Module, [dirname(file)]);
  if (
    !Array.isArray(paths) ||
    !paths.every((p: unknown) => typeof p === 'string')
  )
    throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
  compiled.filename = file;
  compiled.paths = paths.filter(
    (p: unknown): p is string => typeof p === 'string',
  );
  const compile: unknown = Reflect.get(compiled, '_compile');
  if (typeof compile !== 'function')
    throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
  Reflect.apply(compile, compiled, [code.toString(), file]);
  const exports: unknown = compiled.exports;
  const classes: TransportClasses = {
    Connection: transportData(exports, 'Connection'),
    Frame: transportData(exports, 'Frame'),
    FrameDispatcher: transportData(exports, 'FrameDispatcher'),
    CRConnection: transportData(exports, 'CRConnection'),
  };
  registerTransportClasses(classes);
  const api = transportData(exports, 'playwright'),
    chromium = transportData(api, 'chromium');
  need(
    transportInstance(transportData(api, '_connection'), classes.Connection),
  );
  need(
    transportData(chromium, '_connection') ===
      transportData(api, '_connection'),
  );
  if (!browserType(chromium)) throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
  return {
    chromium,
    classes,
    evidence: {
      implementation: 'PINNED_SAME_BYTES_ISOLATED_INSTANCE' as const,
      packageVersion: '1.65.1' as const,
      packageSha256: sha(pkg),
      coreSha256: sha(original),
      appendSha256: sha(APPEND),
      compiledSha256: sha(code),
      singletonReplaced: true,
      installedVendorWritten: false,
      coreBytes: original.length,
    },
  };
};
let cached: ReturnType<typeof loadFactory> | undefined;
let unavailable = false,
  active: object | undefined;
export const createNativeTransport = (
  scope: CapacityScope,
  signal: AbortSignal,
  actorsExpected: number | undefined,
  legId: string | undefined,
) => {
  requireCapacityScope(scope);
  if (signal.aborted) throw Error('CAPACITY_EVIDENCE_INVALID');
  const profile = capacityExecutionProfile(scope);
  if (process.platform !== 'linux' || !profile) return undefined;
  if (
    actorsExpected === undefined ||
    !legId ||
    !/^(anonymous_entry_prepare|fresh_registration|existing_login_game)-native_browser-(3|10|20|40|60)$/u.test(
      legId,
    ) ||
    Number(legId.split('-').at(-1)) !== actorsExpected
  )
    throw Error('TRANSPORT_CONTEXT_INVALID');
  const projection = createTransportDiagnostics(actorsExpected),
    token = {};
  let factory: ReturnType<typeof loadFactory> | undefined,
    hooks: ReturnType<typeof installTransportHooks> | undefined;
  let closing = false,
    hookAttempted = false,
    written = false;
  const get = () => {
    if (
      closing ||
      signal.aborted ||
      unavailable ||
      (active && active !== token)
    )
      throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
    active = token;
    try {
      factory = cached ??= loadFactory();
    } catch {
      unavailable = true;
      throw Error('TRANSPORT_FACTORY_UNAVAILABLE');
    }
    if (!hookAttempted) {
      hookAttempted = true;
      try {
        hooks = installTransportHooks(
          factory.classes,
          projection,
          scope.appUrl,
        );
      } catch {
        projection.fail();
      }
    }
    return factory;
  };
  const beforeClose = () => {
    if (closing) return;
    closing = true;
    try {
      hooks?.uninstall();
    } catch {
      projection.fail();
    }
    projection.seal();
  };
  return {
    browserType: {
      launchServer: (...args: Parameters<BrowserType['launchServer']>) =>
        get().chromium.launchServer(...args),
      connect: (endpoint: string) => get().chromium.connect(endpoint),
    },
    bind: (actorIndex: number, page: Page) => {
      try {
        if (!closing) hooks?.bind(actorIndex, page.mainFrame());
      } catch {
        projection.fail();
      }
    },
    beforeClose,
    closed: (resourcesClosed: boolean) => {
      if (resourcesClosed && active === token) active = undefined;
    },
    finish: async (journal: ColdEntryJournal, resourcesClosed: boolean) => {
      if (written) return;
      written = true;
      beforeClose();
      try {
        await journal.write('native-transport-diagnostics', {
          schemaVersion: 1,
          ...projection.snapshot(),
          collection: factory
            ? projection.snapshot().collection
            : 'UNAVAILABLE',
          sourceRevision: scope.sourceRevision,
          planId: scope.planId,
          legId,
          executionProfileSha256: profile.sha256,
          provenance: factory?.evidence ?? null,
          resourcesClosed,
        });
      } catch {
        /* Optional journal failure cannot replace original stop. */
      }
    },
  };
};
