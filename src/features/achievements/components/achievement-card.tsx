import type { AchievementCatalogItem } from '../types';

const statePresentation = {
  in_progress: { icon: '↗', label: '進行中' },
  not_started: { icon: '○', label: '未開始' },
  unlocked: { icon: '✓', label: '已解鎖' },
} as const;

const unlockDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeZone: 'Asia/Taipei',
});

// 依成就代碼給徽章表情（colorplay-new 成就頁的視覺語彙）；未知代碼用 🏅。
const badgeEmoji = (stableCode: string): string => {
  if (stableCode.includes('perfect')) return '🎯';
  if (stableCode.includes('first_task')) return '🌱';
  if (stableCode.includes('mistake')) return '🔥';
  if (stableCode.includes('master')) return '👑';
  if (stableCode.includes('level')) return '🚀';
  if (stableCode.includes('streak')) return '⚡';
  if (stableCode.includes('blook')) return '🦊';
  return '🏅';
};

export function AchievementCard({
  item,
}: Readonly<{ item: AchievementCatalogItem }>) {
  const presentation = statePresentation[item.state];
  const unlocked = item.state === 'unlocked';

  return (
    <li className="list-none">
      <article
        className={`achievement-card${
          unlocked ? ' achievement-card--unlocked' : ' achievement-card--locked'
        }`}
      >
        <div
          aria-hidden="true"
          className={`achievement-card__tile${
            unlocked
              ? ' achievement-card__tile--unlocked'
              : ' achievement-card__tile--locked'
          }`}
        >
          {badgeEmoji(item.stableCode)}
        </div>
        <div className="achievement-card__body">
          <div className="achievement-card__title-row">
            <h2 className="achievement-card__name">{item.displayName}</h2>
            {unlocked ? (
              <span className="achievement-card__chip">已獲得</span>
            ) : null}
          </div>
          <p className="achievement-card__description">{item.description}</p>
          <p
            className="achievement-card__state"
            data-achievement-state={item.state}
          >
            <span aria-hidden="true">{presentation.icon} </span>
            {presentation.label}
          </p>
          {item.state === 'in_progress' &&
          item.progress !== null &&
          item.target !== null ? (
            <div className="achievement-card__progress">
              <progress
                aria-label={`${item.displayName}進度`}
                className="w-full accent-[var(--color-primary)]"
                max={item.target}
                value={item.progress}
              />
              <span className="achievement-card__progress-text">
                {String(item.progress)} / {String(item.target)}
              </span>
            </div>
          ) : null}
          {unlocked && item.unlockedAt ? (
            <p className="achievement-card__date">
              解鎖於 {unlockDateFormatter.format(new Date(item.unlockedAt))}
            </p>
          ) : null}
        </div>
      </article>
    </li>
  );
}
