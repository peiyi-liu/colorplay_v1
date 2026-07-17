import { describe, expect, it } from 'vitest';
import type { Page } from '@playwright/test';

import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  recordSuccessfulLocalLogout,
  unexpectedBrowserHealth,
  unexpectedRequestFailures,
  type TrackedRequestFailure,
} from '../e2e/browser-health';

const logoutUrl = 'http://127.0.0.1:54321/auth/v1/logout?scope=local';

const createRequest = (method = 'POST', url = logoutUrl) => ({
  method: () => method,
  url: () => url,
});

const failureFor = (
  request: ReturnType<typeof createRequest>,
  errorText = 'net::ERR_ABORTED',
): TrackedRequestFailure<ReturnType<typeof createRequest>> => ({
  errorText,
  request,
});

describe('browser health logout request identity', () => {
  it('ignores one exact Chromium abort only when that request received a successful response', () => {
    const request = createRequest();
    const successfulRequests = new Set<typeof request>();
    recordSuccessfulLocalLogout(successfulRequests, {
      request: () => request,
      status: () => 204,
    });

    expect(
      unexpectedRequestFailures(
        'chromium',
        [failureFor(request)],
        successfulRequests,
      ),
    ).toEqual([]);
  });

  it('uses one confirmed response fallback when Playwright reports different request identities', () => {
    const failedRequest = createRequest();
    const respondedRequest = createRequest();

    expect(
      unexpectedRequestFailures(
        'chromium',
        [failureFor(failedRequest)],
        new Set(),
        {
          request: () => respondedRequest,
          status: () => 204,
        },
      ),
    ).toEqual([]);
  });

  it('never swallows a second identical abort after an identity-matched abort', () => {
    const identityMatchedRequest = createRequest();
    const unrelatedRequest = createRequest();

    expect(
      unexpectedRequestFailures(
        'chromium',
        [failureFor(identityMatchedRequest), failureFor(unrelatedRequest)],
        new Set([identityMatchedRequest]),
        {
          request: () => unrelatedRequest,
          status: () => 204,
        },
      ),
    ).toEqual([`net::ERR_ABORTED ${logoutUrl}`]);
  });

  it('removes at most one of two fallback-qualified identical aborts', () => {
    const firstRequest = createRequest();
    const secondRequest = createRequest();

    expect(
      unexpectedRequestFailures(
        'chromium',
        [failureFor(firstRequest), failureFor(secondRequest)],
        new Set(),
        {
          request: () => createRequest(),
          status: () => 204,
        },
      ),
    ).toEqual([`net::ERR_ABORTED ${logoutUrl}`]);
  });

  it('keeps a second otherwise qualifying Chromium abort', () => {
    const firstRequest = createRequest();
    const secondRequest = createRequest();
    const successfulRequests = new Set([firstRequest, secondRequest]);

    expect(
      unexpectedRequestFailures(
        'chromium',
        [failureFor(firstRequest), failureFor(secondRequest)],
        successfulRequests,
      ),
    ).toEqual([`net::ERR_ABORTED ${logoutUrl}`]);
  });

  it.each([
    ['firefox', createRequest(), 'net::ERR_ABORTED'],
    ['chromium', createRequest('GET'), 'net::ERR_ABORTED'],
    [
      'chromium',
      createRequest(
        'POST',
        'http://127.0.0.1:54321/auth/v1/logout?scope=global',
      ),
      'net::ERR_ABORTED',
    ],
    ['chromium', createRequest(), 'net::ERR_FAILED'],
  ])(
    'keeps the failure when browser/method/error does not qualify: %s %s',
    (browserName, request, errorText) => {
      expect(
        unexpectedRequestFailures(
          browserName,
          [failureFor(request, errorText)],
          new Set([request]),
        ),
      ).toEqual([`${errorText} ${request.url()}`]);
    },
  );

  it('keeps an identical-looking request without matching object identity', () => {
    const respondedRequest = createRequest();
    const failedRequest = createRequest();

    expect(
      unexpectedRequestFailures(
        'chromium',
        [failureFor(failedRequest)],
        new Set([respondedRequest]),
      ),
    ).toEqual([`net::ERR_ABORTED ${logoutUrl}`]);
  });

  it('records only a successful exact local logout response', () => {
    const successfulRequest = createRequest();
    const failedRequest = createRequest();
    const wrongMethodRequest = createRequest('GET');
    const wrongUrlRequest = createRequest(
      'POST',
      'http://127.0.0.1:54321/auth/v1/logout?scope=global',
    );
    const successfulRequests = new Set<typeof successfulRequest>();

    recordSuccessfulLocalLogout(successfulRequests, {
      request: () => successfulRequest,
      status: () => 204,
    });
    recordSuccessfulLocalLogout(successfulRequests, {
      request: () => failedRequest,
      status: () => 400,
    });
    recordSuccessfulLocalLogout(successfulRequests, {
      request: () => wrongMethodRequest,
      status: () => 204,
    });
    recordSuccessfulLocalLogout(successfulRequests, {
      request: () => wrongUrlRequest,
      status: () => 204,
    });

    expect(successfulRequests).toEqual(new Set([successfulRequest]));
  });
});

describe('browser health declared failures', () => {
  const createPageHarness = () => {
    const handlers = new Map<string, ((event: unknown) => void)[]>();
    const page = {
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
    };
    return {
      emit: (event: string, payload: unknown) => {
        for (const handler of handlers.get(event) ?? []) handler(payload);
      },
      page: page as unknown as Page,
    };
  };
  const joinUrl = 'http://127.0.0.1:54321/rest/v1/rpc/join_classroom?columns=x';
  const joinPattern = /\/rest\/v1\/rpc\/join_classroom(?:\?.*)?$/u;
  const response = (status: number, url = joinUrl) => ({
    request: () => createRequest('POST', url),
    status: () => status,
    url: () => url,
  });
  const consoleError = (url = joinUrl) => ({
    location: () => ({ url }),
    text: () =>
      'Failed to load resource: the server responded with a status of 400 (Bad Request)',
    type: () => 'error',
  });

  it('consumes exactly one observed declared response and its matching console error', () => {
    const harness = createPageHarness();
    const health = attachBrowserHealth(harness.page);
    declareExpectedBrowserFailure(health, {
      count: 1,
      status: 400,
      urlPattern: joinPattern,
    });

    harness.emit('response', response(400));
    harness.emit('console', consoleError());

    expect(expectedBrowserFailures(health)).toEqual([
      {
        expected_count: 1,
        observed_count: 1,
        status: 400,
        url_pattern: joinPattern.source,
      },
    ]);
    expect(unexpectedBrowserHealth(health, 'chromium')).toEqual({
      consoleErrors: [],
      failedRequests: [],
      pageErrors: [],
      serverErrors: [],
    });
  });

  it('reports a missing declaration observation and keeps extra or unrelated 400 responses', () => {
    const missingHarness = createPageHarness();
    const missingHealth = attachBrowserHealth(missingHarness.page);
    declareExpectedBrowserFailure(missingHealth, {
      count: 1,
      status: 400,
      urlPattern: joinPattern,
    });
    expect(expectedBrowserFailures(missingHealth)[0]?.observed_count).toBe(0);

    const extraHarness = createPageHarness();
    const extraHealth = attachBrowserHealth(extraHarness.page);
    declareExpectedBrowserFailure(extraHealth, {
      count: 1,
      status: 400,
      urlPattern: joinPattern,
    });
    extraHarness.emit('response', response(400));
    extraHarness.emit('response', response(400));
    extraHarness.emit(
      'response',
      response(400, 'http://127.0.0.1:54321/rest/v1/rpc/other'),
    );
    expect(
      unexpectedBrowserHealth(extraHealth, 'chromium').serverErrors,
    ).toEqual([
      `400 ${joinUrl}`,
      '400 http://127.0.0.1:54321/rest/v1/rpc/other',
    ]);
  });

  it('never excludes ERR_ABORTED through an expected response declaration', () => {
    const request = createRequest('POST', joinUrl);
    expect(
      unexpectedRequestFailures('chromium', [failureFor(request)], new Set()),
    ).toEqual([`net::ERR_ABORTED ${joinUrl}`]);
  });
});
