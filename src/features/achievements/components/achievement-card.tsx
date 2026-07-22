import { Icon, type IconName } from '../../../components/ui/icons';
import type { AchievementCatalogItem } from '../types';

const unlockDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeZone: 'Asia/Taipei',
});

// 依成就代碼給徽章色彩(icon+淡色底,鎖定時由 CSS 轉灰)。
const badgeColor = (stableCode: string): string => {
  if (stableCode.includes('perfect')) return 'var(--coral-600)';
  if (stableCode.includes('first_task')) return 'var(--hue-ch2)';
  if (stableCode.includes('mistake')) return 'var(--hue-ch1)';
  if (stableCode.includes('master')) return 'var(--amber-600)';
  if (stableCode.includes('level')) return 'var(--hue-ch4)';
  if (stableCode.includes('streak')) return 'var(--hue-ch6)';
  if (stableCode.includes('blook')) return 'var(--hue-ch3)';
  return 'var(--hue-ch5)';
};

// 依成就代碼給徽章圖示(SVG icon 名稱);未知代碼用 medal。
const badgeIcon = (stableCode: string): IconName => {
  if (stableCode.includes('perfect')) return 'target';
  if (stableCode.includes('first_task')) return 'sprout';
  if (stableCode.includes('mistake')) return 'flame';
  if (stableCode.includes('master')) return 'crown';
  if (stableCode.includes('level')) return 'star';
  if (stableCode.includes('streak')) return 'bolt';
  if (stableCode.includes('blook')) return 'palette';
  return 'medal';
};

export function AchievementCard({
  item,
}: Readonly<{ item: AchievementCatalogItem }>) {
  const unlocked = item.state === 'unlocked';
  const hasProgress = item.progress !== null && item.target !== null;
  const progressPercent =
    item.progress !== null && item.target !== null && item.target > 0
      ? Math.min(100, Math.round((item.progress / item.target) * 100))
      : 0;

  return (
    <li className="list-none">
      <article
        className={`achievement-card${
          unlocked ? ' achievement-card--unlocked' : ' achievement-card--locked'
        }`}
        data-achievement-state={item.state}
      >
        <div
          aria-hidden="true"
          className={`achievement-card__tile${
            unlocked
              ? ' achievement-card__tile--unlocked'
              : ' achievement-card__tile--locked'
          }`}
          style={{ color: badgeColor(item.stableCode) }}
        >
          <Icon name={badgeIcon(item.stableCode)} size={26} />
        </div>
        <div className="achievement-card__body">
          <div className="achievement-card__title-row">
            <h2 className="achievement-card__name">{item.displayName}</h2>
            {unlocked ? (
              <span className="achievement-card__chip">已獲得</span>
            ) : null}
          </div>
          <p className="achievement-card__description">{item.description}</p>
          {unlocked ? (
            item.unlockedAt ? (
              <p className="achievement-card__date">
                解鎖於 {unlockDateFormatter.format(new Date(item.unlockedAt))}
              </p>
            ) : null
          ) : (
            <div className="achievement-card__progress">
              <div className="achievement-card__progress-row">
                <span>進度</span>
                <span className="achievement-card__progress-value">
                  {hasProgress
                    ? `${String(item.progress)} / ${String(item.target)}`
                    : '—'}
                </span>
              </div>
              <div
                className="achievement-card__bar"
                {...(hasProgress
                  ? {
                      'aria-label': `${item.displayName}進度`,
                      'aria-valuemax': item.target,
                      'aria-valuemin': 0,
                      'aria-valuenow': item.progress,
                      role: 'progressbar',
                    }
                  : {})}
              >
                <div
                  className="achievement-card__bar-fill"
                  style={{ width: `${String(progressPercent)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </article>
    </li>
  );
}
