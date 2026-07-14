import { describe, expect, it } from 'vitest';

import {
  recordSuccessfulLocalLogout,
  removeConfirmedSuccessfulLocalLogoutAbort,
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
  it('removes exactly one headed Chromium abort after an exact successful logout response', () => {
    const request = createRequest();
    const failures = [
      `net::ERR_ABORTED ${logoutUrl}`,
      `net::ERR_ABORTED ${logoutUrl}`,
    ];

    expect(
      removeConfirmedSuccessfulLocalLogoutAbort('chromium', failures, {
        request: () => request,
        status: () => 204,
      }),
    ).toEqual([`net::ERR_ABORTED ${logoutUrl}`]);
  });

  it.each([
    ['firefox', createRequest(), 204],
    ['chromium', createRequest('GET'), 204],
    [
      'chromium',
      createRequest(
        'POST',
        'http://127.0.0.1:54321/auth/v1/logout?scope=global',
      ),
      204,
    ],
    ['chromium', createRequest(), 400],
  ])(
    'does not remove abort without a confirmed exact local logout: %s %s',
    (browserName, request, status) => {
      const failure = `net::ERR_ABORTED ${logoutUrl}`;
      expect(
        removeConfirmedSuccessfulLocalLogoutAbort(browserName, [failure], {
          request: () => request,
          status: () => status,
        }),
      ).toEqual([failure]);
    },
  );

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
