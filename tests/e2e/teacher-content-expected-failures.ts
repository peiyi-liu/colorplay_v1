import type { ExpectedBrowserFailureDeclaration } from './browser-health';

export const teacherContentExpectedFailureDeclarations = {
  draftCodeAlreadyPublished: {
    count: 1,
    status: 400,
    urlPattern: /\/rest\/v1\/rpc\/upsert_question_draft(?:\?.*)?$/u,
  },
} as const satisfies Readonly<
  Record<string, ExpectedBrowserFailureDeclaration>
>;
