import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuizSessionHarness } from './quiz-session.harness';

describe('QuizSessionHarness', () => {
  it('mounts the idle quiz preview with four answer options', async () => {
    render(<QuizSessionHarness scenario="idle" />);

    expect(
      await screen.findByRole('heading', { name: '第 3 章・色彩表示' }),
    ).toBeVisible();
    expect(screen.getByText('3-1・色彩三要素與色名的表示')).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('mounts the incorrect-answer explanation preview', async () => {
    render(<QuizSessionHarness scenario="incorrect" />);

    expect(
      await screen.findByRole('heading', { name: '✕ 答錯了' }),
    ).toBeVisible();
    expect(screen.getByText('色相、明度、彩度共同描述色彩。')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '我理解了，下一題' }),
    ).toBeVisible();
  });
});
