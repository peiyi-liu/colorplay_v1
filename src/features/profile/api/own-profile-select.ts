// 本人 profile 查詢的唯一欄位清單。
// repository 與 E2E 邊界匹配器共用此常數；欄位變更時兩側自動同步，
// 防止 Phase 7 `reduced_motion` 類型的 select 漂移再度發生。
export const OWN_PROFILE_SELECT =
  'id,display_name,role,timezone,reduced_motion';
