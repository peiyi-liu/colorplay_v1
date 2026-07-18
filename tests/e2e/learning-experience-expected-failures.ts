import type { ExpectedBrowserFailureDeclaration } from './browser-health';

export const learningExpectedFailureDeclarations = {
  hintUnavailable: {
    count: 1,
    status: 400,
    urlPattern: /\/rest\/v1\/rpc\/request_question_hint(?:\?.*)?$/u,
  },
} as const satisfies Readonly<
  Record<string, ExpectedBrowserFailureDeclaration>
>;
