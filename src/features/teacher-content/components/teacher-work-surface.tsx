import type { ReactNode } from 'react';

export type TeacherWorkSurfaceState =
  | { kind: 'content' }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string; retry?: () => void }
  | { kind: 'loading'; message: string };

export function TeacherWorkSurface({
  children,
  eyebrow,
  menu,
  state = { kind: 'content' },
  subtitle,
  title,
  toolbar,
  variant = 'workspace',
}: Readonly<{
  children: ReactNode;
  eyebrow?: string;
  menu: ReactNode;
  state?: TeacherWorkSurfaceState;
  subtitle?: string;
  title: string;
  toolbar?: ReactNode;
  variant?: 'analytics' | 'live' | 'workspace';
}>) {
  return (
    <div className="teacher-workspace-shell">
      {menu}
      <section
        aria-labelledby="teacher-work-surface-title"
        className={`teacher-work-surface teacher-work-surface--${variant}`}
      >
        <header className="teacher-work-surface__header">
          <div>
            {eyebrow ? <p>{eyebrow}</p> : null}
            <h1 id="teacher-work-surface-title">{title}</h1>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          {toolbar ? (
            <div className="teacher-work-surface__toolbar">{toolbar}</div>
          ) : null}
        </header>
        <div className="teacher-work-surface__content">
          {state.kind === 'loading' ? (
            <p role="status">{state.message}</p>
          ) : state.kind === 'empty' ? (
            <p>{state.message}</p>
          ) : state.kind === 'error' ? (
            <div role="alert">
              <p>{state.message}</p>
              {state.retry ? (
                <button onClick={state.retry} type="button">
                  重新載入
                </button>
              ) : null}
            </div>
          ) : (
            children
          )}
        </div>
      </section>
    </div>
  );
}
