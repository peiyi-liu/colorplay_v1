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

export function AchievementCard({
  item,
}: Readonly<{ item: AchievementCatalogItem }>) {
  const presentation = statePresentation[item.state];

  return (
    <li className="list-none">
      <article className="flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <div
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full bg-[var(--color-brand-yellow)] text-2xl"
        >
          🏅
        </div>
        <div>
          <h2 className="m-0 text-xl font-extrabold text-[var(--color-text)]">
            {item.displayName}
          </h2>
          <p className="mt-2 text-[var(--color-muted)]">{item.description}</p>
        </div>
        <p
          className="mt-auto font-extrabold"
          data-achievement-state={item.state}
        >
          <span aria-hidden="true">{presentation.icon} </span>
          {presentation.label}
        </p>
        {item.state === 'in_progress' &&
        item.progress !== null &&
        item.target !== null ? (
          <div className="grid gap-2">
            <progress
              aria-label={`${item.displayName}進度`}
              className="w-full accent-[var(--color-primary)]"
              max={item.target}
              value={item.progress}
            />
            <span className="text-sm font-bold">
              {String(item.progress)} / {String(item.target)}
            </span>
          </div>
        ) : null}
        {item.state === 'unlocked' && item.unlockedAt ? (
          <p className="m-0 text-sm text-[var(--color-muted)]">
            解鎖日期：{unlockDateFormatter.format(new Date(item.unlockedAt))}
          </p>
        ) : null}
      </article>
    </li>
  );
}
