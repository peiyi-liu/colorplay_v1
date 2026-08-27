import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReviewCardMarkdownPreview } from './review-card-markdown-preview';

describe('ReviewCardMarkdownPreview', () => {
  it('輸入 Markdown 後立即用學生端 renderer 更新預覽', async () => {
    const user = userEvent.setup();
    render(<ReviewCardMarkdownPreview />);

    const editor = screen.getByRole('textbox', { name: '複習卡 Markdown' });
    await user.clear(editor);
    await user.type(
      editor,
      '# 即時預覽\n\n**明度**是色彩的明暗程度，==這是重點==。',
    );

    expect(
      screen.getByRole('heading', { level: 1, name: '即時預覽' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('明度', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('這是重點', { selector: 'mark' }),
    ).toBeInTheDocument();
  });

  it('未建立圖片對照時直接顯示匯入驗證錯誤', () => {
    render(<ReviewCardMarkdownPreview />);

    const editor = screen.getByRole('textbox', { name: '複習卡 Markdown' });
    fireEvent.change(editor, {
      target: { value: '![未知圖片](review-media:UNKNOWN)' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '圖片代號「UNKNOWN」沒有核准的媒體 mapping',
    );
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(editor).toHaveAttribute(
      'aria-describedby',
      'review-markdown-preview-errors',
    );
  });

  it('第三張圖片後停用新增操作並說明上限', async () => {
    const user = userEvent.setup();
    render(<ReviewCardMarkdownPreview />);

    const addMedia = screen.getByRole('button', { name: '新增圖片' });
    await user.click(addMedia);
    await user.click(addMedia);

    expect(
      screen.getByRole('button', { name: '已達 3 張上限' }),
    ).toBeDisabled();
    expect(screen.getByText('每張複習卡最多 3 張圖片。')).toBeInTheDocument();
  });
});
