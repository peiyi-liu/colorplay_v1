import type { ExpectedBrowserFailureDeclaration } from './browser-health';

export const classroomLeaderboardExpectedFailureDeclarations = {
  oldJoinCode: {
    count: 1,
    status: 400,
    urlPattern: /\/rest\/v1\/rpc\/join_classroom(?:\?.*)?$/u,
  },
  outsiderLeaderboard: {
    count: 1,
    status: 403,
    urlPattern: /\/rest\/v1\/rpc\/get_classroom_leaderboard(?:\?.*)?$/u,
  },
  teacherBMembers: {
    count: 1,
    status: 403,
    urlPattern: /\/rest\/v1\/rpc\/list_owned_classroom_members(?:\?.*)?$/u,
  },
} as const satisfies Readonly<
  Record<string, ExpectedBrowserFailureDeclaration>
>;
