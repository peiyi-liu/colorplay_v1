import type { ReactNode } from 'react';

type StatTileProps = Readonly<{
  label: string;
  value: ReactNode;
  tone?: 'default' | 'xp' | 'token';
}>;

/** 大數字統計格（大廳數據列／教師看板指標）。 */
export function StatTile({ label, value, tone = 'default' }: StatTileProps) {
  return (
    <div className={`ui-stat-tile ui-stat-tile--${tone}`}>
      <p className="ui-stat-tile__label">{label}</p>
      <p className="ui-stat-tile__value">{value}</p>
    </div>
  );
}
