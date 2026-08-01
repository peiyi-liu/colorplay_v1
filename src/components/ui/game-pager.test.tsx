import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GamePager } from './game-pager';

const renderPager = (count: number, pageSize: number) =>
  render(
    <GamePager
      ariaLabel="測試分頁"
      items={Array.from({ length: count }, (_, i) => `項目${String(i + 1)}`)}
      pageSize={pageSize}
    >
      {(pageItems) => (
        <ul aria-label="測試清單">
          {pageItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </GamePager>,
  );

describe('GamePager', () => {
  it('未溢出時不渲染任何分頁 chrome', () => {
    renderPager(3, 4);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '下一頁' })).toBeNull();
    expect(screen.queryByText(/第 \d+ \/ \d+ 頁/u)).toBeNull();
  });

  it('溢出時切片並顯示頁碼與箭頭', () => {
    renderPager(7, 3);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('第 1 / 3 頁')).toBeVisible();
    expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeEnabled();
  });

  it('下一頁/上一頁換頁且尾頁箭頭停用', async () => {
    renderPager(7, 3);
    const next = screen.getByRole('button', { name: '下一頁' });
    await userEvent.click(next);
    expect(screen.getByText('項目4')).toBeVisible();
    await userEvent.click(next);
    expect(screen.getByText('第 3 / 3 頁')).toBeVisible();
    expect(screen.getByText('項目7')).toBeVisible();
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '上一頁' }));
    expect(screen.getByText('第 2 / 3 頁')).toBeVisible();
  });

  it('鍵盤 ←/→ 於分頁器內換頁', async () => {
    renderPager(7, 3);
    screen.getByRole('button', { name: '下一頁' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('第 2 / 3 頁')).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('第 1 / 3 頁')).toBeVisible();
  });

  it('鍵盤連續 → 到尾頁後，← 仍可換頁（焦點不因箭頭停用而掉出分頁器）', async () => {
    renderPager(7, 3);
    screen.getByRole('button', { name: '下一頁' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('第 3 / 3 頁')).toBeVisible();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('第 2 / 3 頁')).toBeVisible();
  });

  it('僅 2 頁時鍵盤 → 到尾頁後 ← 仍可換頁（另一箭頭換頁當下仍是舊 render 的 disabled 態）', async () => {
    renderPager(7, 4);
    expect(screen.getByText('第 1 / 2 頁')).toBeVisible();
    screen.getByRole('button', { name: '下一頁' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('第 2 / 2 頁')).toBeVisible();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('第 1 / 2 頁')).toBeVisible();
  });

  it('items 縮短時頁碼 clamp 不越界', async () => {
    const { rerender } = renderPager(7, 3);
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    rerender(
      <GamePager
        ariaLabel="測試分頁"
        items={['項目1', '項目2', '項目3', '項目4']}
        pageSize={3}
      >
        {(pageItems) => (
          <ul aria-label="測試清單">
            {pageItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </GamePager>,
    );
    expect(screen.getByText('第 2 / 2 頁')).toBeVisible();
    expect(screen.getByText('項目4')).toBeVisible();
  });
});
