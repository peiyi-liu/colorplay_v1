import { describe, expect, it } from 'vitest';

import {
  recordSuccessfulLocalLogout,
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
