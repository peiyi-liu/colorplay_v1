import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewCardMarkdown } from './review-card-markdown';

describe('ReviewCardMarkdown', () => {
  it('將一級 Markdown 標題顯示為語意化 H1', () => {
    render(
      <ReviewCardMarkdown
        markdown="# 色彩學總整理"
        resolveImage={() => ({ loading: false, resolvedUrl: null })}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: '色彩學總整理' }),
    ).toBeInTheDocument();
  });

  it('將雙等號包住的文字顯示為語意化螢光標記', () => {
    render(
      <ReviewCardMarkdown
        markdown="請記住==互補色位於色相環相對位置==。"
        resolveImage={() => ({ loading: false, resolvedUrl: null })}
      />,
    );

    expect(
      screen.getByText('互補色位於色相環相對位置', { selector: 'mark' }),
    ).toBeInTheDocument();
  });

  it('以語意化 HTML 顯示標題、粗體與 GFM 表格', () => {
    render(
      <ReviewCardMarkdown
        markdown={`## 色彩三屬性

**明度**代表色彩的明暗程度。

| 屬性 | 說明 |
| --- | --- |
| 明度 | 明暗程度 |`}
        resolveImage={() => ({ loading: false, resolvedUrl: null })}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: '色彩三屬性' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('明度', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '屬性' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '明暗程度' })).toBeInTheDocument();
  });

  it('只透過媒體 resolver 顯示已核准的圖片來源', () => {
    const resolveImage = vi.fn((source: string) => ({
      loading: false,
      resolvedUrl:
        source === 'review-card-media/chapter-3/P301.webp'
          ? 'https://signed.example/P301.webp?token=short-lived'
          : null,
    }));

    render(
      <ReviewCardMarkdown
        markdown="![明度階調示意圖](review-card-media/chapter-3/P301.webp)"
        resolveImage={resolveImage}
      />,
    );

    expect(resolveImage).toHaveBeenCalledWith(
      'review-card-media/chapter-3/P301.webp',
    );
    expect(screen.getByRole('img', { name: '明度階調示意圖' })).toHaveAttribute(
      'src',
      'https://signed.example/P301.webp?token=short-lived',
    );
  });

  it('不執行 raw HTML，也不直接載入外部圖片 URL', () => {
    render(
      <ReviewCardMarkdown
        markdown={
          '<script>alert(1)</script>\n\n![外部圖片](https://evil.example/x.png)'
        }
        resolveImage={() => ({
          loading: false,
          resolvedUrl: null,
        })}
      />,
    );

    expect(document.querySelector('script')).toBeNull();
    expect(
      document.querySelector('img[src^="https://evil.example"]'),
    ).toBeNull();
  });

  it('編輯器換成另一張圖片後會清除前一張圖片的失敗狀態', () => {
    const resolveImage = (source: string) => ({
      loading: false,
      resolvedUrl: `https://signed.example/${source}`,
    });
    const { rerender } = render(
      <ReviewCardMarkdown
        markdown="![第一張](review-media:P301)"
        resolveImage={resolveImage}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: '第一張' }));
    expect(screen.getByText('圖片載入失敗：第一張')).toBeInTheDocument();

    rerender(
      <ReviewCardMarkdown
        markdown="![第二張](review-media:P302)"
        resolveImage={resolveImage}
      />,
    );

    expect(screen.getByRole('img', { name: '第二張' })).toHaveAttribute(
      'src',
      'https://signed.example/review-media:P302',
    );
  });

  it('同一媒體取得新的 signed URL 後會重新嘗試載入', () => {
    const markdown = '![明度階調示意圖](review-card-media/chapter-3/P301.webp)';
    const { rerender } = render(
      <ReviewCardMarkdown
        markdown={markdown}
        resolveImage={() => ({
          loading: false,
          resolvedUrl: 'https://signed.example/expired',
        })}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: '明度階調示意圖' }));

    rerender(
      <ReviewCardMarkdown
        markdown={markdown}
        resolveImage={() => ({
          loading: false,
          resolvedUrl: 'https://signed.example/refreshed',
        })}
      />,
    );

    expect(screen.getByRole('img', { name: '明度階調示意圖' })).toHaveAttribute(
      'src',
      'https://signed.example/refreshed',
    );
  });
});
