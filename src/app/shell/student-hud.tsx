import type { ReactNode } from 'react';

export function StudentHud({ children }: Readonly<{ children: ReactNode }>) {
  return <header className="hud-top hud-top--student">{children}</header>;
}
