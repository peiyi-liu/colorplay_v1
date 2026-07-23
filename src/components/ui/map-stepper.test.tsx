import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MapStepper } from './map-stepper';

describe('MapStepper', () => {
  it('renders one node per stage and disables locked ones', () => {
    render(
      <MapStepper
        total={5}
        currentIndex={1}
        unlockedCount={2}
        onJump={vi.fn()}
      />,
    );
    const nodes = screen.getAllByRole('button');
    expect(nodes).toHaveLength(5);
    expect(nodes[0]).toBeEnabled();
    expect(nodes[1]).toBeEnabled();
    expect(nodes[2]).toBeDisabled();
    expect(nodes[4]).toBeDisabled();
  });

  it('marks the current node and jumps only to unlocked nodes', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(
      <MapStepper
        total={5}
        currentIndex={1}
        unlockedCount={2}
        onJump={onJump}
      />,
    );
    const nodes = screen.getAllByRole('button');
    expect(nodes[1]).toHaveAttribute('aria-current', 'step');
    const [firstNode] = nodes;
    if (!firstNode) throw new Error('MAP_NODE_MISSING');
    await user.click(firstNode);
    expect(onJump).toHaveBeenCalledWith(0);
  });
});
