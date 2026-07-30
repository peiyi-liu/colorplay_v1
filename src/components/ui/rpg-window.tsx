import type { HTMLAttributes, ReactNode } from 'react';

type RpgWindowProps = {
  /** 窗標題;省略時不渲染 heading */
  title?: ReactNode;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

/** JRPG 對話窗:全站唯一像素容器(spec/07 JRPG 基線、CONTEXT.md RPG Window) */
export function RpgWindow({
  title,
  children,
  className,
  ...rest
}: RpgWindowProps) {
  const classes = ['rpg-window', className].filter(Boolean).join(' ');
  return (
    <section className={classes} {...rest}>
      {title ? <h2 className="rpg-window__title">{title}</h2> : null}
      <div className="rpg-window__body">{children}</div>
    </section>
  );
}
