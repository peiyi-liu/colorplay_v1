import { Link } from 'react-router-dom';

import { Icon, type IconName } from '../../../components/ui/icons';
import type { PastelTheme } from '../../../components/ui/pastel-themes';
import {
  StatusBadge,
  type StatusBadgeState,
} from '../../../components/ui/status-badge';

type LearningChapterCardProps = Readonly<{
  chapterNumber: number;
  title: string;
  description: string;
  theme: PastelTheme;
  icon: IconName;
  /** 'active'=進行中(最前緣章節)、'open'=已開放、'locked'=尚未解鎖。 */
  status: StatusBadgeState;
  /** 進行中卡:2px 黃色強調邊框＋淡黃外圈。 */
  current?: boolean;
  /** 可玩章節的挑戰路由;鎖定章節省略。 */
  startHref?: string;
  /** 複習與進度路由;鎖定章節省略。 */
  reviewHref?: string;
}>;

/** 淡彩章節大卡(spec §五–§七):Icon＋狀態標籤、標題、說明、底部操作列。 */
export function LearningChapterCard({
  chapterNumber,
  title,
  description,
  theme,
  icon,
  status,
  current = false,
  startHref,
  reviewHref,
}: LearningChapterCardProps) {
  const locked = status === 'locked';
  const cardClass = [
    'pastel-card',
    'chapter-card',
    current ? 'pastel-card--current' : '',
    locked ? 'pastel-card--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClass} data-theme={theme}>
      <div className="pastel-card__top">
        <span aria-hidden="true" className="pastel-card__icon">
          <Icon name={locked ? 'lock' : icon} size={18} />
        </span>
        <StatusBadge state={status} />
      </div>
      <h3 className="pastel-card__title">
        Chapter {chapterNumber}：{title}
      </h3>
      <p className="pastel-card__description">{description}</p>
      <div className="pastel-card__foot">
        {locked ? (
          <span className="pastel-card__hint">完成前一章節後解鎖</span>
        ) : (
          <>
            {startHref ? (
              <Link
                className="pastel-action"
                data-acceptance-interactive="true"
                data-primary-action="true"
                to={startHref}
              >
                {current ? '繼續學習' : '開始任務'}
                <span aria-hidden="true"> →</span>
              </Link>
            ) : null}
            {reviewHref ? (
              <Link
                aria-label={`${title} 複習與進度`}
                className="pastel-card__more"
                to={reviewHref}
              >
                複習與進度<span aria-hidden="true"> →</span>
              </Link>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
