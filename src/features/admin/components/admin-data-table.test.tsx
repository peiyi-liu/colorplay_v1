import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdminDataTable } from './admin-data-table';

const columns = [
  { header: 'display_name', key: 'display_name', personal: false },
  { header: 'full_name', key: 'full_name', personal: true },
  { header: 'role', key: 'role', personal: false },
];

const rows = [
  { display_name: '小明', full_name: '王＊＊', role: 'student' },
  { display_name: '小美', full_name: '陳＊＊', role: 'teacher' },
];

describe('AdminDataTable', () => {
  it('renders catalog-driven headers and the server-projected rows', () => {
    render(
      <AdminDataTable caption="使用者資料" columns={columns} rows={rows} />,
    );

    const table = screen.getByRole('table', { name: '使用者資料' });
    for (const column of columns) {
      expect(
        within(table).getByRole('columnheader', { name: column.header }),
      ).toBeInTheDocument();
    }
    expect(within(table).getByText('小明')).toBeInTheDocument();
    expect(within(table).getByText('student')).toBeInTheDocument();
  });

  it('shows the server mask for personal cells and offers reveal only on those cells', () => {
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        onReveal={vi.fn()}
        rows={rows}
      />,
    );

    // 遮罩值原樣來自 server 投影,前端不自己算遮罩
    expect(screen.getByText('王＊＊')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /揭露/u })).toHaveLength(2);

    const firstRow = screen.getByText('小明').closest('tr') as HTMLElement;
    expect(
      within(firstRow).getByRole('button', { name: '揭露 full_name' }),
    ).toBeInTheDocument();
    // 非 personal 欄不得出現揭露入口
    expect(
      within(firstRow).queryByRole('button', { name: '揭露 display_name' }),
    ).not.toBeInTheDocument();
    expect(
      within(firstRow).queryByRole('button', { name: '揭露 role' }),
    ).not.toBeInTheDocument();
  });

  it('asks the caller to reveal one specific row and column', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        onReveal={onReveal}
        rows={rows}
      />,
    );

    const secondRow = screen.getByText('小美').closest('tr') as HTMLElement;
    await user.click(
      within(secondRow).getByRole('button', { name: '揭露 full_name' }),
    );

    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(1, 'full_name');
  });

  it('offers no reveal affordance at all when the page passes no reveal handler', () => {
    render(
      <AdminDataTable caption="使用者資料" columns={columns} rows={rows} />,
    );

    expect(
      screen.queryByRole('button', { name: /揭露/u }),
    ).not.toBeInTheDocument();
  });

  it('loads more only with a server-issued cursor, and hands that exact cursor back', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        nextCursor="eyJiaW5kaW5nIjoiYWJjIn0="
        onLoadMore={onLoadMore}
        rows={rows}
      />,
    );

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    expect(onLoadMore).toHaveBeenCalledWith('eyJiaW5kaW5nIjoiYWJjIn0=');
  });

  it('never fabricates a cursor: no load-more button when the server issued none', () => {
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        onLoadMore={vi.fn()}
        pageSizeLimit={2}
        rows={rows}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '載入更多' }),
    ).not.toBeInTheDocument();
    // 剛好滿頁但 server 沒給 cursor:誠實說明已達單頁上限,不假裝還有下一頁
    expect(screen.getByText(/已達單頁上限 2 筆/u)).toBeInTheDocument();
  });

  it('stays quiet about paging when the result is below the page limit', () => {
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        pageSizeLimit={50}
        rows={rows}
      />,
    );

    expect(screen.queryByText(/已達單頁上限/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '載入更多' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a wide table scrolling inside its own container', () => {
    render(
      <AdminDataTable caption="使用者資料" columns={columns} rows={rows} />,
    );

    const scroller = screen.getByRole('table', {
      name: '使用者資料',
    }).parentElement;
    expect(scroller).toHaveClass('ui-table-scroll');
    expect(scroller).toHaveClass('admin-data-table__scroll');
  });

  it('shows a truthful empty state', () => {
    render(<AdminDataTable caption="使用者資料" columns={columns} rows={[]} />);

    expect(screen.getByText('查詢結果沒有資料。')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a dash for null values instead of blank cells', () => {
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        rows={[{ display_name: '小明', full_name: null, role: 'student' }]}
      />,
    );

    const row = screen.getByText('小明').closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('exposes no export or download control (spec §7)', () => {
    render(
      <AdminDataTable
        caption="使用者資料"
        columns={columns}
        nextCursor="cursor-1"
        onLoadMore={vi.fn()}
        onReveal={vi.fn()}
        rows={rows}
      />,
    );

    expect(screen.queryByText(/匯出|下載|CSV|export|download/iu)).toBeNull();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
