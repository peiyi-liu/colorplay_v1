import type { ReactNode } from 'react';

type EmptyStateProps = Readonly<{
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}>;

/** 空狀態卡：圖示＋標題＋說明＋單一行動。 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      {icon ? (
        <span className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="ui-empty-state__title">{title}</h3>
      {description ? (
        <p className="ui-empty-state__description">{description}</p>
      ) : null}
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </div>
  );
}
