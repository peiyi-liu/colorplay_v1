import { describe, expect, it } from 'vitest';

import { paginateBookBlocks } from './book-paginator';

function paginationElements(
  heights: Readonly<Record<string, number>>,
  pageHeight: number,
) {
  const sourceElement = document.createElement('div');
  for (const [key, height] of Object.entries(heights)) {
    const block = document.createElement('div');
    block.dataset.bookBlockKey = key;
    block.dataset.testHeight = String(height);
    sourceElement.append(block);
  }

  const measureElement = document.createElement('div');
  Object.defineProperties(measureElement, {
    clientHeight: { configurable: true, value: pageHeight },
    clientWidth: { configurable: true, value: 320 },
    scrollHeight: {
      configurable: true,
      get() {
        return Array.from(measureElement.children).reduce(
          (height, child) =>
            height + Number((child as HTMLElement).dataset.testHeight ?? 0),
          0,
        );
      },
    },
  });
  return { measureElement, sourceElement };
}

describe('paginateBookBlocks', () => {
  it('把無法放入空白頁的完整 Markdown 區塊放在可捲動 fallback 頁，且不遺失其他內容', () => {
    const { measureElement, sourceElement } = paginationElements(
      { intro: 40, 'markdown-list': 180 },
      100,
    );

    const pages = paginateBookBlocks({
      blocks: [
        { key: 'intro', splittable: false },
        { key: 'markdown-list', splittable: false },
      ],
      measureElement,
      sourceElement,
    });

    expect(pages).toEqual([
      {
        items: [{ blockKey: 'intro', key: 'intro' }],
        overflowFallback: false,
      },
      {
        items: [{ blockKey: 'markdown-list', key: 'markdown-list' }],
        overflowFallback: true,
      },
    ]);
  });

  it('純文字即使連一個字都無法放入空白頁，也改用完整內容 fallback 而不是逐字裁切', () => {
    const { measureElement, sourceElement } = paginationElements(
      { paragraph: 180 },
      100,
    );

    const pages = paginateBookBlocks({
      blocks: [{ key: 'paragraph', splittable: true, text: '完整保留這一段' }],
      measureElement,
      sourceElement,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]?.overflowFallback).toBe(true);
    expect(pages[0]?.items.map((item) => item.text).join('')).toBe(
      '完整保留這一段',
    );
  });

  it('保留同一 Markdown 清單的群組識別，讓同頁項目可合併成單一清單', () => {
    const { measureElement, sourceElement } = paginationElements(
      { 'list-1': 40, 'list-2': 40 },
      100,
    );

    const pages = paginateBookBlocks({
      blocks: [
        { groupKey: 'ordered-list', key: 'list-1', splittable: false },
        { groupKey: 'ordered-list', key: 'list-2', splittable: false },
      ],
      measureElement,
      sourceElement,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items.map((item) => item.groupKey)).toEqual([
      'ordered-list',
      'ordered-list',
    ]);
  });

  it('標題在頁尾無法連同下一區塊顯示時，將標題移到下一頁', () => {
    const { measureElement, sourceElement } = paginationElements(
      { heading: 20, intro: 70, paragraph: 35 },
      100,
    );

    const pages = paginateBookBlocks({
      blocks: [
        { key: 'intro', splittable: false },
        { keepWithNext: true, key: 'heading', splittable: false },
        { key: 'paragraph', splittable: false },
      ],
      measureElement,
      sourceElement,
    });

    expect(pages).toEqual([
      {
        items: [{ blockKey: 'intro', key: 'intro' }],
        overflowFallback: false,
      },
      {
        items: [
          { blockKey: 'heading', key: 'heading' },
          { blockKey: 'paragraph', key: 'paragraph' },
        ],
        overflowFallback: false,
      },
    ]);
  });

  it('保留兩像素安全餘量，避免量測與實際 Markdown 渲染的捨入差異裁切頁尾', () => {
    const { measureElement, sourceElement } = paginationElements(
      { intro: 80, paragraph: 19 },
      100,
    );

    const pages = paginateBookBlocks({
      blocks: [
        { key: 'intro', splittable: false },
        { key: 'paragraph', splittable: false },
      ],
      measureElement,
      sourceElement,
    });

    expect(pages).toEqual([
      {
        items: [{ blockKey: 'intro', key: 'intro' }],
        overflowFallback: false,
      },
      {
        items: [{ blockKey: 'paragraph', key: 'paragraph' }],
        overflowFallback: false,
      },
    ]);
  });
});
