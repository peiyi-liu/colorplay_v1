import type { ReactNode } from 'react';

type CardProps = Readonly<{
  padding?: 'md' | 'lg';
  className?: string;
  children: ReactNode;
}>;

/** GGAME 白底大圓角卡片（spec/07 §2 元件語彙）。 */
export function Card({ padding = 'md', className, children }: CardProps) {
  const classes = ['ui-card', `ui-card--${padding}`, className]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
