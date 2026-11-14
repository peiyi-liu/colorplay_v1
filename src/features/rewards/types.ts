export type EconomySummary = Readonly<{
  totalXp: number;
  level: number;
  currentLevelXp: number;
  xpPerLevel: 500;
  tokenBalance: number;
  walletReconciled: true;
}>;

export type EconomyRepository = Readonly<{
  getSummary(): Promise<EconomySummary>;
}>;

export type EconomyRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class EconomyRepositoryError extends Error {
  constructor(public readonly code: EconomyRepositoryErrorCode) {
    super(code);
    this.name = 'EconomyRepositoryError';
  }
}
