import type { ReactNode } from 'react';

type SectionHeaderProps = Readonly<{
  chip?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}>;

/** 區塊標頭：chip 眉標＋粗黑標題＋說明＋右側動作（GGAME 版型）。 */
export function SectionHeader({
  chip,
  title,
  description,
  actions,
}: SectionHeaderProps) {
  return (
    <header className="ui-section-header">
      <div>
        {chip}
        <h2 className="ui-section-header__title">{title}</h2>
        {description ? (
          <p className="ui-section-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="ui-section-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
