export type BlookInventoryItem = Readonly<{
  id: string;
  stableCode: string;
  name: string;
  emoji: string;
  costTokens: number;
  owned: boolean;
  equipped: boolean;
}>;

export type BlookInventory = Readonly<{
  tokenBalance: number;
  activeBlookId: string;
  items: readonly BlookInventoryItem[];
}>;

export type FrameInventoryItem = Readonly<{
  id: string;
  stableCode: string;
  name: string;
  gradientStart: string;
  gradientEnd: string;
  costTokens: number;
  owned: boolean;
  equipped: boolean;
}>;

export type FrameInventory = Readonly<{
  tokenBalance: number;
  activeFrameId: string;
  items: readonly FrameInventoryItem[];
}>;

export type InventoryRepository = Readonly<{
  getInventory(): Promise<BlookInventory>;
  purchaseBlook(blookId: string): Promise<BlookInventory>;
  equipBlook(blookId: string): Promise<BlookInventory>;
  getFrameInventory(): Promise<FrameInventory>;
  purchaseFrame(frameId: string): Promise<FrameInventory>;
  equipFrame(frameId: string): Promise<FrameInventory>;
}>;

export type InventoryRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_TOKENS'
  | 'NOT_OWNED'
  | 'NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class InventoryRepositoryError extends Error {
  constructor(
    public readonly code: InventoryRepositoryErrorCode,
    public readonly shortfall: number | null = null,
  ) {
    super(code);
    this.name = 'InventoryRepositoryError';
  }
}
