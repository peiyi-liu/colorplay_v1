import type { AchievementCatalogItem } from '../../achievements/types';

/** 純表現層:本次 xpAwarded 是否使總 XP 跨越等級門檻(xpPerLevel 取自 EconomySummary,
    伺服器已入帳,此處只做展示判斷,不觸任何計分/finalize) */
export const crossedLevelBoundary = (
  totalXp: number,
  xpAwarded: number,
  xpPerLevel: number,
): boolean =>
  xpAwarded > 0 &&
  xpPerLevel > 0 &&
  Math.floor((totalXp - xpAwarded) / xpPerLevel) <
    Math.floor(totalXp / xpPerLevel);

/** 本次新解鎖成就:unlockedAt 不早於 session 完成時間(finalize 同交易,時間戳相等) */
export const unlockedSince = (
  items: readonly AchievementCatalogItem[],
  sinceIso: string,
): readonly AchievementCatalogItem[] => {
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return [];
  return items.filter(
    (candidate) =>
      candidate.state === 'unlocked' &&
      candidate.unlockedAt !== null &&
      Date.parse(candidate.unlockedAt) >= since,
  );
};
