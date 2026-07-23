import type { ExpectedBrowserFailureDeclaration } from './browser-health';

export const assignmentsLiveExpectedFailureDeclarations = {
  duplicateHostAdvance: {
    count: 1,
    status: 400,
    urlPattern: /\/rest\/v1\/rpc\/advance_live_session(?:\?.*)?$/u,
  },
} as const satisfies Readonly<
  Record<string, ExpectedBrowserFailureDeclaration>
>;
