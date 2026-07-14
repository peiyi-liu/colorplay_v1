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
): string[] {
  let ignoredLogoutAbort = false;

  return failures.flatMap(({ errorText, request }) => {
    const failure = `${errorText} ${request.url()}`;
    if (
      !ignoredLogoutAbort &&
      browserName === 'chromium' &&
      failure === chromiumLogoutAbort &&
      isExactLocalLogout(request) &&
      successfulLocalLogouts.has(request)
    ) {
      ignoredLogoutAbort = true;
      return [];
    }

    return [failure];
  });
}

export function removeConfirmedSuccessfulLocalLogoutAbort<
  RequestType extends TrackedRequest,
>(
  browserName: string,
  failures: readonly string[],
  response: TrackedResponse<RequestType>,
): string[] {
  const request = response.request();
  if (
    browserName !== 'chromium' ||
    response.status() >= 400 ||
    !isExactLocalLogout(request)
  ) {
    return [...failures];
  }

  const allowedFailureIndex = failures.indexOf(chromiumLogoutAbort);
  return failures.filter((_, index) => index !== allowedFailureIndex);
}

export type BrowserHealth = Readonly<{
  consoleErrors: string[];
  failedRequests: string[];
  pageErrors: string[];
  serverErrors: string[];
}>;

type BrowserHealthCollection = Readonly<{
  consoleErrors: string[];
  failedRequests: TrackedRequestFailure<Request>[];
  pageErrors: string[];
  serverErrors: string[];
  successfulLocalLogouts: Set<Request>;
}>;

export function attachBrowserHealth(page: Page): BrowserHealthCollection {
  const health: BrowserHealthCollection = {
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
    successfulLocalLogouts: new Set(),
  };

  page.on('console', (message) => {
    if (message.type() === 'error') health.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    health.failedRequests.push({
      errorText: request.failure()?.errorText ?? 'failed',
      request,
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) health.serverErrors.push(response.url());
    recordSuccessfulLocalLogout(health.successfulLocalLogouts, response);
  });

  return health;
}

export function unexpectedBrowserHealth(
  health: BrowserHealthCollection,
  browserName: string,
): BrowserHealth {
  return {
    consoleErrors: health.consoleErrors,
    failedRequests: unexpectedRequestFailures(
      browserName,
      health.failedRequests,
      health.successfulLocalLogouts,
    ),
    pageErrors: health.pageErrors,
    serverErrors: health.serverErrors,
  };
}
