import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteWorldStage } from './route-world-stage';

describe('RouteWorldStage', () => {
  it('projects route content through the selected continuous-world scene', () => {
    render(
      <RouteWorldStage
        reducedMotion={false}
        scene="learning-map"
        transitionKey="/app"
      >
        <p>世界地圖內容</p>
      </RouteWorldStage>,
    );

    const stage = screen.getByRole('main');
    expect(stage).toHaveClass('game-stage__scene', 'route-world-stage');
    expect(stage).toHaveAttribute('data-world-scene', 'learning-map');
    expect(stage).toHaveAttribute('data-motion', 'full');
    expect(stage).toHaveAttribute('data-transition-key', '/app');
    expect(stage).toContainElement(screen.getByText('世界地圖內容'));
  });

  it('exposes the profile reduced-motion preference without changing the scene', () => {
    render(
      <RouteWorldStage
        reducedMotion
        scene="teacher-route"
        transitionKey="/teacher"
      >
        <p>教師工作區</p>
      </RouteWorldStage>,
    );

    const stage = screen.getByRole('main');
    expect(stage).toHaveAttribute('data-world-scene', 'teacher-route');
    expect(stage).toHaveAttribute('data-motion', 'reduced');
    expect(
      stage.querySelector('.route-world-stage__transition'),
    ).toHaveAttribute('aria-hidden', 'true');
  });
});
