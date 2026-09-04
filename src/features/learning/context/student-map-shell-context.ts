import type { BlookInventoryItem } from '../../inventory/types';

export type StudentMapShellContext = Readonly<{
  equippedBlook: BlookInventoryItem | null;
}>;
