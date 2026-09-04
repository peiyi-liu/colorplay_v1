import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TeacherWorkSurface } from './teacher-work-surface';

const renderSurface = (
  state: React.ComponentProps<typeof TeacherWorkSurface>['state'] = {
    kind: 'content',
  },
) =>
  render(
    <TeacherWorkSurface
      eyebrow="班級觀測"
      menu={<aside>教師選單</aside>}
      state={state}
      subtitle="目前班級"
      title="教學分析"
      toolbar={<button type="button">篩選資料</button>}
    >
      <button type="button">內容操作</button>
    </TeacherWorkSurface>,
  );

describe('TeacherWorkSurface', () => {
  it('keeps one page title and the visible DOM order from identity to content', () => {
    const { container } = renderSurface();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const orderedText = Array.from(
      container.querySelectorAll('p, h1, span, button'),
    ).map((element) => element.textContent);
    expect(orderedText).toEqual([
      '班級觀測',
      '教學分析',
      '目前班級',
      '篩選資料',
      '內容操作',
    ]);
  });

  it('renders content children only for the content state', () => {
    const { rerender } = renderSurface();
    expect(screen.getByRole('button', { name: '內容操作' })).toBeVisible();

    rerender(
      <TeacherWorkSurface
        menu={<aside>教師選單</aside>}
        state={{ kind: 'loading', message: '資料載入中…' }}
        title="教學分析"
      >
        <button type="button">內容操作</button>
      </TeacherWorkSurface>,
    );
    expect(
      screen.queryByRole('button', { name: '內容操作' }),
    ).not.toBeInTheDocument();
  });

  it('distinguishes loading, empty and error semantics', () => {
    const { rerender } = renderSurface({
      kind: 'loading',
      message: '資料載入中…',
    });
    expect(screen.getByRole('status')).toHaveTextContent('資料載入中…');

    rerender(
      <TeacherWorkSurface
        menu={<aside>教師選單</aside>}
        state={{ kind: 'empty', message: '目前沒有資料。' }}
        title="教學分析"
      >
        內容
      </TeacherWorkSurface>,
    );
    expect(screen.getByText('目前沒有資料。')).not.toHaveAttribute('role');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(
      <TeacherWorkSurface
        menu={<aside>教師選單</aside>}
        state={{ kind: 'error', message: '資料載入失敗。' }}
        title="教學分析"
      >
        內容
      </TeacherWorkSurface>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('資料載入失敗。');
  });

  it('invokes the supplied retry callback from the error state', async () => {
    const retry = vi.fn();
    renderSurface({ kind: 'error', message: '資料載入失敗。', retry });

    await userEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
