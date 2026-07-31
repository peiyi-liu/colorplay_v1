export type SpiritVariant = 'blue' | 'green' | 'red';

const variantOrder: readonly SpiritVariant[] = ['red', 'blue', 'green'];

/** 三色精靈名銜(CONTEXT.md Tri-Spirits;決議 3 NPC 導師)。 */
export const spiritLabels: Readonly<Record<SpiritVariant, string>> = {
  blue: '藍精靈導師',
  green: '綠精靈導師',
  red: '紅精靈導師',
};

/** 依 seed(章節/小節標題)確定性指派講解精靈;同 seed 恆同精靈。 */
export function spiritForSeed(seed: string): SpiritVariant {
  let sum = 0;
  for (const ch of seed) sum = (sum + (ch.codePointAt(0) ?? 0)) % 3;
  return variantOrder[sum] ?? 'red';
}

/** CSS-first 幾何精靈佔位(owner 0731 拍板 A;素材批換 sprite 圖)。 */
export function SpiritAvatar({
  variant,
}: Readonly<{ variant: SpiritVariant }>) {
  return (
    <span
      aria-hidden="true"
      className={`spirit-avatar spirit-avatar--${variant}`}
    >
      <span className="spirit-avatar__body" />
      <span className="spirit-avatar__eyes" />
    </span>
  );
}
