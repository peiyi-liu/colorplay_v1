import type { ReactNode } from 'react';

export type RouteWorldScene =
  'learning-map' | 'public-route' | 'student-route' | 'teacher-route';

export function RouteWorldStage({
  children,
  reducedMotion,
  scene,
  transitionKey,
}: Readonly<{
  children: ReactNode;
  reducedMotion: boolean;
  scene: RouteWorldScene;
  transitionKey: string;
}>) {
  return (
    <main
      className="game-stage__scene route-world-stage"
      data-motion={reducedMotion ? 'reduced' : 'full'}
      data-transition-key={transitionKey}
      data-world-scene={scene}
      id="main-content"
      tabIndex={-1}
    >
      <span
        aria-hidden="true"
        className="route-world-stage__transition"
        key={transitionKey}
      />
      {children}
    </main>
  );
}
