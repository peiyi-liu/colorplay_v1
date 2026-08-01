import type { ExpectedBrowserFailureDeclaration } from './browser-health';

// oldJoinCode（舊加入碼失效）曾在這裡宣告——它原本驗證瀏覽器頁面對
// join_classroom RPC 收到 400 的行為，但該互動的 UI（一次性加入碼
// modal／加入班級表單）已隨 07-27/07-30 owner 裁定移除。classroom-leaderboard
// .spec.ts 現在改用 helpers/classrooms.ts 的 joinClassroomByCode 直接呼叫
// join_classroom RPC（Node 端的 supabase-js client，非瀏覽器頁面），舊碼
// 失效改用 `.rejects.toThrow()` 驗證，不會產生瀏覽器可觀察到的網路回應，
// 因此不再需要（也無法）在這裡宣告對應的 browser-health 失敗筆數。
export const classroomLeaderboardExpectedFailureDeclarations = {
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
