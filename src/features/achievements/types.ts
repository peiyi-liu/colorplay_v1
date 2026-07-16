export type AchievementState = 'not_started' | 'in_progress' | 'unlocked';

export type AchievementCatalogItem = Readonly<{
  badgeKey: string;
  description: string;
  displayName: string;
  progress: number | null;
  stableCode: string;
  state: AchievementState;
  target: number | null;
  unlockedAt: string | null;
}>;

export type AchievementCatalog = Readonly<{
  items: readonly AchievementCatalogItem[];
  totalCount: number;
  unlockedCount: number;
}>;

export type AchievementRepository = Readonly<{
  getCatalog(): Promise<AchievementCatalog>;
}>;

export type AchievementRepositoryErrorCode =
  'AUTH_REQUIRED' | 'INVALID_RESPONSE' | 'UNAVAILABLE';

export class AchievementRepositoryError extends Error {
  constructor(public readonly code: AchievementRepositoryErrorCode) {
    super(code);
    this.name = 'AchievementRepositoryError';
  }
}
