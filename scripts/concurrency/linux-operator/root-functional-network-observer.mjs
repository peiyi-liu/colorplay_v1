import process from 'node:process';
import { URL } from 'node:url';
// Root-only read-only diagnostics for the real Local functional entry. Never Native capacity.
import { chromium } from '../../colorplay-live-recovery/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, basename } from 'node:path';
const root = import.meta.dirname,
  source = resolve(root, '../../colorplay-live-recovery'),
  entry = resolve(source, 'scripts/concurrency/run-functional.ts');
if (resolve(process.argv[1] ?? '') !== entry)
  throw Error('ROOT_OBSERVER_ENTRY_INVALID');
const offset = process.argv.indexOf('--request'),
  path = offset >= 0 ? process.argv[offset + 1] : null;
if (
  !path ||
  resolve(path) !== path ||
  resolve(path, '..') !== root ||
  !/^functional-request-wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}\.json$/.test(
    basename(path),
  )
)
  throw Error('ROOT_OBSERVER_REQUEST_INVALID');
const info = lstatSync(path);
if (
  !info.isFile() ||
  info.isSymbolicLink() ||
  info.nlink !== 1 ||
  (info.mode & 0o777) !== 0o600 ||
  info.uid !== process.getuid() ||
  info.size > 131072 ||
  realpathSync(path) !== path
)
  throw Error('ROOT_OBSERVER_OWNERSHIP_INVALID');
const request = JSON.parse(readFileSync(path, 'utf8')),
  scope = request.scope;
if (
  scope.environment !== 'local' ||
  scope.projectId !== 'cp-whole-site-261115' ||
  scope.appUrl !== 'http://127.0.0.1:58373' ||
  scope.supabaseUrl !== 'http://127.0.0.1:58321' ||
  !/^[a-f0-9]{40}$/.test(scope.expectedRevision) ||
  basename(path) !== 'functional-request-' + scope.runId + '.json'
)
  throw Error('ROOT_OBSERVER_SCOPE_INVALID');
const target = root + '/root-network-diagnostic-' + scope.runId + '.json';
try {
  lstatSync(target);
  throw Error('ROOT_OBSERVER_PRIOR_OUTPUT');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const contexts = new WeakMap(),
  pages = new WeakMap(),
  states = [],
  report = {
    kind: 'ROOT_LOCAL_FUNCTIONAL_NETWORK_DIAGNOSTIC',
    sourceRevision: scope.expectedRevision,
    runId: scope.runId,
    readOnlyObservation: true,
    nativeCapacityObservation: false,
    available: true,
    truncated: false,
    pages: 0,
    requests: 0,
    failures: [],
    httpErrors: [],
    consoleErrors: [],
    pageErrors: [],
    rawUrlsPayloadsTokensOrMessagesStored: false,
  };
const route = (page) => {
  try {
    const u = new URL(page.url());
    if (u.origin !== scope.appUrl)
      return u.href === 'about:blank' ? 'BLANK' : 'OTHER_ORIGIN';
    const p = u.pathname;
    return p === '/'
      ? 'HOME'
      : p === '/login'
        ? 'LOGIN'
        : p === '/register'
          ? 'REGISTER'
          : p === '/forgot-password'
            ? 'RECOVERY_REQUEST'
            : p === '/reset-password'
              ? 'RECOVERY_FORM'
              : p.startsWith('/admin/mfa/')
                ? 'ADMIN_MFA'
                : p.startsWith('/admin/content')
                  ? 'ADMIN_CONTENT'
                  : p.startsWith('/admin')
                    ? 'ADMIN'
                    : p.startsWith('/teacher')
                      ? 'TEACHER'
                      : p.startsWith('/app')
                        ? 'STUDENT'
                        : p === '/unauthorized'
                          ? 'DENIED'
                          : 'OTHER_APP';
  } catch {
    return 'UNKNOWN';
  }
};
const endpoint = (value, type) => {
  try {
    const u = new URL(value);
    if (u.origin === scope.supabaseUrl) {
      const p = u.pathname;
      if (/^\/rest\/v1\/rpc\/[a-z][a-z0-9_]{0,80}$/.test(p)) return p;
      if (/^\/auth\/v1\/(?:token|logout|user|verify|recover|signup)$/.test(p))
        return p;
      if (/^\/functions\/v1\/[a-z][a-z0-9-]{0,80}$/.test(p)) return p;
      return p.startsWith('/rest/v1/')
        ? 'API_TABLE_READ'
        : p.startsWith('/storage/v1/')
          ? 'API_STORAGE'
          : 'OTHER_API';
    }
    if (u.origin === scope.appUrl)
      return type === 'Font'
        ? 'APP_FONT'
        : type === 'Image'
          ? 'APP_IMAGE'
          : ['Script', 'Stylesheet'].includes(type)
            ? 'APP_STATIC'
            : type === 'Document'
              ? 'APP_DOCUMENT'
              : 'APP_OTHER';
    return 'OTHER_ORIGIN';
  } catch {
    return 'UNKNOWN';
  }
};
const add = (name, value) => {
  if (
    report.failures.length +
      report.httpErrors.length +
      report.consoleErrors.length +
      report.pageErrors.length >=
    300
  ) {
    report.truncated = true;
    report.available = false;
    return;
  }
  report[name].push(value);
};
const observe = async (context, page, state) => {
  if (pages.has(page)) return pages.get(page);
  const work = (async () => {
    const index = ++report.pages,
      records = new Map();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text(),
        shape = t.includes('ERR_ABORTED')
          ? 'ERR_ABORTED'
          : t.includes('ERR_FAILED')
            ? 'ERR_FAILED'
            : /server responded with a status of [45][0-9]{2}/.test(t)
              ? 'HTTP_ERROR'
              : 'OTHER_CONSOLE_ERROR';
      add('consoleErrors', {
        page: index,
        route: route(page),
        closing: state.closing,
        shape,
      });
    });
    page.on('pageerror', (e) =>
      add('pageErrors', {
        page: index,
        route: route(page),
        closing: state.closing,
        name: ['Error', 'TypeError', 'ReferenceError', 'SyntaxError'].includes(
          e.name,
        )
          ? e.name
          : 'OTHER',
      }),
    );
    const cdp = await context.newCDPSession(page);
    cdp.on('Network.requestWillBeSent', (e) => {
      try {
        if (records.size >= 4096) {
          report.available = false;
          return;
        }
        const type = [
          'Document',
          'Stylesheet',
          'Image',
          'Media',
          'Font',
          'Script',
          'TextTrack',
          'XHR',
          'Fetch',
          'Prefetch',
          'EventSource',
          'WebSocket',
          'Manifest',
          'SignedExchange',
          'Ping',
          'CSPViolationReport',
          'Preflight',
          'Other',
        ].includes(e.type)
          ? e.type
          : 'Other';
        records.set(e.requestId, {
          requestId:
            typeof e.requestId === 'string' && e.requestId.length <= 180
              ? e.requestId
              : 'UNKNOWN',
          page: index,
          type,
          method: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS',
            'HEAD',
          ].includes(e.request.method)
            ? e.request.method
            : 'OTHER',
          endpoint: endpoint(e.request.url, type),
          requestRoute: route(page),
          status: null,
        });
        report.requests++;
      } catch {
        report.available = false;
      }
    });
    cdp.on('Network.responseReceived', (e) => {
      const row = records.get(e.requestId);
      if (!row) return;
      row.status =
        Number.isInteger(e.response.status) &&
        e.response.status >= 100 &&
        e.response.status <= 599
          ? e.response.status
          : null;
      if (row.status >= 400)
        add('httpErrors', {
          ...row,
          responseRoute: route(page),
          closing: state.closing,
        });
    });
    cdp.on('Network.loadingFinished', (e) => records.delete(e.requestId));
    cdp.on('Network.loadingFailed', (e) => {
      const row = records.get(e.requestId);
      if (!row) report.available = false;
      else
        add('failures', {
          ...row,
          failureRoute: route(page),
          closing: state.closing,
          canceled: e.canceled === true,
          error:
            e.errorText === 'net::ERR_ABORTED'
              ? 'ERR_ABORTED'
              : e.errorText === 'net::ERR_FAILED'
                ? 'ERR_FAILED'
                : 'OTHER',
        });
      records.delete(e.requestId);
    });
    page.once('close', () => records.clear());
    await cdp.send('Network.enable');
  })().catch(() => {
    report.available = false;
  });
  pages.set(page, work);
  return work;
};
const wrap = (context) => {
  if (contexts.has(context)) return;
  const state = { closing: false },
    newPage = context.newPage.bind(context),
    close = context.close.bind(context);
  contexts.set(context, state);
  states.push(state);
  context.on('page', (page) => void observe(context, page, state));
  context.newPage = async (...args) => {
    const page = await newPage(...args);
    await observe(context, page, state);
    return page;
  };
  context.close = async (...args) => {
    state.closing = true;
    return close(...args);
  };
};
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args),
    newContext = browser.newContext.bind(browser),
    close = browser.close.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    wrap(context);
    return context;
  };
  browser.close = async (...options) => {
    for (const state of states) state.closing = true;
    return close(...options);
  };
  return browser;
};
process.once('exit', () => {
  try {
    writeFileSync(target, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  } catch {
    process.exitCode = 1;
  }
});
