import { Icon, type IconName } from '../../../components/ui/icons';
import type { PastelTheme } from '../../../components/ui/pastel-themes';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { AchievementCatalogItem } from '../types';

const unlockDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeZone: 'Asia/Taipei',
});

// 依成就家族分配淡彩主題(色值在 tokens.css 的 --pastel-<theme>-*)。
const badgeTheme = (stableCode: string): PastelTheme => {
  if (stableCode.includes('perfect')) return 'coral';
  if (stableCode.includes('first_task')) return 'green';
  if (stableCode.includes('mistake')) return 'blue';
  if (stableCode.includes('master')) return 'yellow';
  if (stableCode.includes('level')) return 'purple';
  if (stableCode.includes('streak')) return 'cyan';
  if (stableCode.includes('blook')) return 'purple';
  return 'blue';
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

/** 淡彩徽章卡(spec §八):Icon＋狀態、名稱、條件;底部為解鎖日期或進度條。 */
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
        className={`pastel-card achievement-card${
          unlocked ? '' : ' achievement-card--locked'
        }`}
        data-achievement-state={item.state}
        data-theme={badgeTheme(item.stableCode)}
      >
        <div className="pastel-card__top">
          <span aria-hidden="true" className="pastel-card__icon">
            <Icon
              name={unlocked ? badgeIcon(item.stableCode) : 'lock'}
              size={18}
            />
          </span>
          <StatusBadge state={unlocked ? 'done' : 'locked'}>
            {unlocked ? '已解鎖' : '未解鎖'}
          </StatusBadge>
        </div>
        <h2 className="pastel-card__title">{item.displayName}</h2>
        <p className="pastel-card__description">{item.description}</p>
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
      </article>
    </li>
  );
}
