import { describe, expect, it } from 'vitest';

import { splitReviewCardMarkdown } from './review-card-markdown-pagination';

describe('splitReviewCardMarkdown', () => {
  it('依 Markdown 語意拆開標題與清單項目，並保留格式與順序', () => {
    const blocks = splitReviewCardMarkdown(`## 色彩體系
1. **混色系**：以色光混色為主
   - CIE 表色系
   - RGB 表色系
2. ==顯色系==：以色料混色為主`);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({
      markdown: '## 色彩體系',
      splittable: false,
    });
    expect(blocks[1]?.markdown).toContain('1. **混色系**');
    expect(blocks[1]?.markdown).toContain('- CIE 表色系');
    expect(blocks[1]?.markdown).toContain('- RGB 表色系');
    expect(blocks[2]?.markdown).toContain('2. ==顯色系==');
    expect(blocks[1]?.groupKey).toBeDefined();
    expect(blocks[2]?.groupKey).toBe(blocks[1]?.groupKey);
    expect(blocks.slice(1).every((block) => !block.splittable)).toBe(true);
  });

  it('行內格式緊接中文字時仍視為完整 Markdown 區塊，不從語法中間切頁', () => {
    expect(splitReviewCardMarkdown('文字後接**粗體內容**仍保留')).toEqual([
      {
        markdown: '文字後接**粗體內容**仍保留',
        splittable: false,
      },
    ]);
  });
});
