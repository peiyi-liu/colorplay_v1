import type { Page, Request } from '@playwright/test';

export type TrackedRequest = Readonly<{
  method(): string;
  url(): string;
}>;

export type TrackedResponse<RequestType extends TrackedRequest> = Readonly<{
  request(): RequestType;
  status(): number;
}>;

export type TrackedRequestFailure<RequestType extends TrackedRequest> =
  Readonly<{
    errorText: string;
    request: RequestType;
  }>;

const localLogoutUrl = 'http://127.0.0.1:54321/auth/v1/logout?scope=local';
const chromiumLogoutAbort = `net::ERR_ABORTED ${localLogoutUrl}`;

const isExactLocalLogout = (request: TrackedRequest) =>
  request.method() === 'POST' && request.url() === localLogoutUrl;

export function recordSuccessfulLocalLogout<RequestType extends TrackedRequest>(
  successfulRequests: Set<RequestType>,
  response: TrackedResponse<RequestType>,
): void {
  const request = response.request();
  if (response.status() < 400 && isExactLocalLogout(request)) {
    successfulRequests.add(request);
  }
}

export function unexpectedRequestFailures<RequestType extends TrackedRequest>(
  browserName: string,
  failures: readonly TrackedRequestFailure<RequestType>[],
  successfulLocalLogouts: ReadonlySet<RequestType>,
  confirmedLogoutResponse?: TrackedResponse<RequestType>,
): string[] {
  let ignoredLogoutAbort = false;
  const responseFallbackIsConfirmed =
    confirmedLogoutResponse !== undefined &&
    confirmedLogoutResponse.status() < 400 &&
    isExactLocalLogout(confirmedLogoutResponse.request());

  // 導航／登出會取消進行中的請求（字體子集、TanStack 卸載中的查詢）。
  // 取消是 client 端行為，不可能代表伺服器拒絕（RLS 拒絕會是 4xx，落在
  // responseErrors）。豁免範圍限 hashed build assets 與本機 Supabase 來源。
  const isNavigationCancellation = (
    errorText: string,
    request: TrackedRequest,
  ) => {
    if (
      !/^(?:cancelled|NS_BINDING_ABORTED|net::ERR_ABORTED)$/u.test(errorText)
    ) {
      return false;
    }
    try {
      const parsed = new URL(request.url());
      if (parsed.pathname.startsWith('/assets/')) return true;
      // 本機 Supabase 只豁免「只讀」請求：GET 或 get_/list_ 讀取 RPC。
      // mutation 與 auth 端點（含 logout）不豁免——其中止可能代表真 bug，
      // logout 語意由下方身分比對規則嚴格把關。
      return (
        parsed.origin === 'http://127.0.0.1:54321' &&
        !parsed.pathname.startsWith('/auth/') &&
        (request.method() === 'GET' ||
          /^\/rest\/v1\/rpc\/(?:get_|list_)/u.test(parsed.pathname))
      );
    } catch {
      return false;
    }
  };

  return failures.flatMap(({ errorText, request }) => {
    if (isNavigationCancellation(errorText, request)) return [];
    const failure = `${errorText} ${request.url()}`;
    if (
      !ignoredLogoutAbort &&
      browserName === 'chromium' &&
      failure === chromiumLogoutAbort &&
      isExactLocalLogout(request) &&
      (successfulLocalLogouts.has(request) || responseFallbackIsConfirmed)
    ) {
      ignoredLogoutAbort = true;
      return [];
    }

    return [failure];
  });
}

export type BrowserHealth = Readonly<{
  consoleErrors: string[];
  failedRequests: string[];
  pageErrors: string[];
  serverErrors: string[];
}>;

export type ExpectedBrowserFailureDeclaration = Readonly<{
  count: number;
  status: number;
  urlPattern: RegExp;
}>;

export type ExpectedBrowserFailureReport = Readonly<{
  expected_count: number;
  observed_count: number;
  status: number;
  url_pattern: string;
}>;

type ExpectedBrowserFailureState = Readonly<{
  declaration: ExpectedBrowserFailureDeclaration;
  observedUrls: string[];
}>;

type TrackedConsoleError = Readonly<{
  text: string;
  url: string;
}>;

export type BrowserHealthCollection = Readonly<{
  consoleErrors: TrackedConsoleError[];
  expectedFailures: ExpectedBrowserFailureState[];
  failedRequests: TrackedRequestFailure<Request>[];
  pageErrors: string[];
  responseErrors: string[];
  successfulLocalLogouts: Set<Request>;
}>;

const matchesUrl = (pattern: RegExp, url: string) => {
  pattern.lastIndex = 0;
  return pattern.test(url);
};

export function declareExpectedBrowserFailure(
  health: BrowserHealthCollection,
  declaration: ExpectedBrowserFailureDeclaration,
): void {
  if (
    !Number.isSafeInteger(declaration.count) ||
    declaration.count < 1 ||
    !Number.isSafeInteger(declaration.status) ||
    declaration.status < 400 ||
    declaration.status > 499 ||
    declaration.urlPattern.global ||
    declaration.urlPattern.sticky
  ) {
    throw new Error('BROWSER_HEALTH_EXPECTED_FAILURE_INVALID');
  }
  health.expectedFailures.push({ declaration, observedUrls: [] });
}

export function expectedBrowserFailures(
  health: BrowserHealthCollection,
): ExpectedBrowserFailureReport[] {
  return health.expectedFailures.map(({ declaration, observedUrls }) => ({
    expected_count: declaration.count,
    observed_count: observedUrls.length,
    status: declaration.status,
    url_pattern: declaration.urlPattern.source,
  }));
}

export function attachBrowserHealth(page: Page): BrowserHealthCollection {
  const health: BrowserHealthCollection = {
    consoleErrors: [],
    expectedFailures: [],
    failedRequests: [],
    pageErrors: [],
    responseErrors: [],
    successfulLocalLogouts: new Set(),
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      health.consoleErrors.push({
        text: message.text(),
        url: message.location().url,
      });
    }
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    health.failedRequests.push({
      errorText: request.failure()?.errorText ?? 'failed',
      request,
    });
  });
  page.on('response', (response) => {
    recordSuccessfulLocalLogout(health.successfulLocalLogouts, response);
    if (response.status() < 400) return;
    const expected = health.expectedFailures.find(
      ({ declaration, observedUrls }) =>
        declaration.status === response.status() &&
        observedUrls.length < declaration.count &&
        matchesUrl(declaration.urlPattern, response.url()),
    );
    if (expected) {
      expected.observedUrls.push(response.url());
      return;
    }
    health.responseErrors.push(
      `${String(response.status())} ${response.url()}`,
    );
  });

  return health;
}

export function unexpectedBrowserHealth(
  health: BrowserHealthCollection,
  browserName: string,
  confirmedLogoutResponse?: TrackedResponse<Request>,
): BrowserHealth {
  const expectedConsoleCounts = health.expectedFailures.map(
    ({ observedUrls }) => observedUrls.length,
  );
  const isCancelledFontDownload = (text: string) =>
    text.includes('downloadable font: download failed') &&
    text.includes('/assets/noto-sans-tc');
  const consoleErrors = health.consoleErrors.flatMap((error) => {
    if (isCancelledFontDownload(error.text)) return [];
    const expectedIndex = health.expectedFailures.findIndex(
      ({ declaration }, index) =>
        (expectedConsoleCounts[index] ?? 0) > 0 &&
        matchesUrl(declaration.urlPattern, error.url),
    );
    if (expectedIndex < 0) return [error.text];
    expectedConsoleCounts[expectedIndex] =
      (expectedConsoleCounts[expectedIndex] ?? 0) - 1;
    return [];
  });
  // webkit 在確認登出後，會把「取消中的本機 REST 請求」記成
  // access control pageerror；與上方 chromium 的 logout abort 同類，
  // 僅在真的有成功 logout 時忽略，避免掩蓋真正的 RLS 問題。
  const logoutConfirmed =
    health.successfulLocalLogouts.size > 0 ||
    (confirmedLogoutResponse !== undefined &&
      confirmedLogoutResponse.status() < 400);
  const isWebkitLogoutRestAbort = (message: string) =>
    browserName === 'webkit' &&
    logoutConfirmed &&
    message.includes('127.0.0.1:54321') &&
    message.includes('due to access control checks');

  return {
    consoleErrors,
    failedRequests: unexpectedRequestFailures(
      browserName,
      health.failedRequests,
      health.successfulLocalLogouts,
      confirmedLogoutResponse,
    ),
    pageErrors: health.pageErrors.filter(
      (message) => !isWebkitLogoutRestAbort(message),
    ),
    serverErrors: health.responseErrors,
  };
}
