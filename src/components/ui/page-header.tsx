import type { ReactNode } from 'react';

type PageHeaderProps = Readonly<{
  title: string;
  description?: string;
  /** 標題左側的返回鍵等前置元素(成就頁「回大廳」)。 */
  leading?: ReactNode;
  /** aria-labelledby 錨點;省略時不掛 id。 */
  titleId?: string;
}>;

/** 淡彩系統頁面標頭:28px 主標題＋14px 說明(手機 24px;spec §三)。 */
export function PageHeader({
  title,
  description,
  leading,
  titleId,
}: PageHeaderProps) {
  return (
    <header className="pastel-hero">
      {leading}
      <div>
        <h1
          className="pastel-hero__title"
          {...(titleId ? { id: titleId } : {})}
        >
          {title}
        </h1>
        {description ? (
          <p className="pastel-hero__description">{description}</p>
        ) : null}
      </div>
    </header>
  );
}
