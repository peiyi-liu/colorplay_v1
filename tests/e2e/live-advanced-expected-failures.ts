import type { ExpectedBrowserFailureDeclaration } from './browser-health';

export const liveAdvancedExpectedFailureDeclarations = {
  outsiderJoinDenied: {
    count: 1,
    status: 400,
    urlPattern: /\/rest\/v1\/rpc\/join_live_session(?:\?.*)?$/u,
  },
} as const satisfies Readonly<
  Record<string, ExpectedBrowserFailureDeclaration>
>;
