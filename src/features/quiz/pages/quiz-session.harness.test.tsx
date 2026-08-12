import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuizSessionHarness } from './quiz-session.harness';

describe('QuizSessionHarness', () => {
  it('mounts the idle quiz preview with four answer options', async () => {
    render(<QuizSessionHarness scenario="idle" />);

    expect(
      await screen.findByRole('heading', { name: '第三章・色彩表示' }),
    ).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });
});
