import { describe, expect, it } from 'vitest';

import { compileReviewCardMarkdown } from '../../scripts/content/review-card-markdown.mjs';

describe('review card Markdown document', () => {
  it('compiles an inline review-media reference without changing table layout', () => {
    const source = [
      '## 色彩三要素',
      '',
      '明度表示色彩的明暗程度。',
      '',
      '![明度階調示意圖](review-media:P301)',
      '',
      '| 明度 | 視覺感受 |',
      '| --- | --- |',
      '| 高明度 | 明亮、輕盈 |',
    ].join('\n');

    const result = compileReviewCardMarkdown(source, {
      P301: {
        altText: '明度階調示意圖',
        assetPath: 'review-card-media/chapter-3/P301.webp',
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.markdown).toBe(
      source.replace(
        'review-media:P301',
        'review-card-media/chapter-3/P301.webp',
      ),
    );
    expect(result.media).toEqual([
      {
        altText: '明度階調示意圖',
        assetPath: 'review-card-media/chapter-3/P301.webp',
        reference: 'P301',
      },
    ]);
  });

  it('rejects raw HTML instead of publishing it as Markdown content', () => {
    const result = compileReviewCardMarkdown(
      '正常文字\n\n<img src="x" onerror="alert(1)">',
      {},
    );

    expect(result.errors).toEqual([
      {
        code: 'RAW_HTML_NOT_ALLOWED',
        message: '複習卡 Markdown 不允許 HTML 標籤',
      },
    ]);
  });

  it('rejects marker color classifications outside the single ColorPlay highlight style', () => {
    const result = compileReviewCardMarkdown('請記住 =r=這段文字==。', {});

    expect(result.errors).toContainEqual({
      code: 'MARKER_COLOR_NOT_ALLOWED',
      message: '螢光標記只接受 ==文字==，不能指定其他顏色',
    });
  });

  it('rejects a fourth inline image before content reaches the database', () => {
    const source = ['P301', 'P302', 'P303', 'P304']
      .map((reference) => `![${reference} 圖片](review-media:${reference})`)
      .join('\n\n');
    const mediaCatalog = Object.fromEntries(
      ['P301', 'P302', 'P303', 'P304'].map((reference) => [
        reference,
        {
          altText: `${reference} 圖片`,
          assetPath: `review-card-media/chapter-3/${reference}.webp`,
        },
      ]),
    );

    const result = compileReviewCardMarkdown(source, mediaCatalog);

    expect(result.errors).toContainEqual({
      code: 'MEDIA_LIMIT_EXCEEDED',
      message: '每張複習卡最多只能插入 3 張圖片',
    });
  });

  it('rejects image URLs that bypass the approved review-media mapping', () => {
    const result = compileReviewCardMarkdown(
      '![外部圖片](https://example.com/image.png)',
      {},
    );

    expect(result.errors).toContainEqual({
      code: 'MEDIA_SOURCE_NOT_ALLOWED',
      message: '複習卡圖片必須使用 review-media:代號',
    });
  });

  it.each([
    ['', '圖片替代文字必須是 1–200 字'],
    ['圖'.repeat(201), '圖片替代文字必須是 1–200 字'],
  ])('rejects invalid media alt text length', (altText, message) => {
    const result = compileReviewCardMarkdown(
      `![${altText}](review-media:P301)`,
      {
        P301: {
          altText,
          assetPath: 'review-card-media/chapter-3/P301.webp',
        },
      },
    );

    expect(result.errors).toContainEqual({
      code: 'MEDIA_ALT_INVALID',
      message,
      reference: 'P301',
    });
  });

  it('rejects more than three approved media mappings even when none is inline', () => {
    const mediaCatalog = Object.fromEntries(
      ['P301', 'P302', 'P303', 'P304'].map((reference) => [
        reference,
        {
          altText: `${reference} 圖片`,
          assetPath: `review-card-media/chapter-3/${reference}.webp`,
        },
      ]),
    );

    const result = compileReviewCardMarkdown('只有文字', mediaCatalog);

    expect(result.errors).toContainEqual({
      code: 'MEDIA_LIMIT_EXCEEDED',
      message: '每張複習卡最多只能插入 3 張圖片',
    });
  });

  it('accepts content within the database 8000 character card contract', () => {
    const result = compileReviewCardMarkdown('字'.repeat(5002), {});

    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: 'CONTENT_LENGTH_EXCEEDED' }),
    );
  });

  it('rejects content longer than the database 8000 character card contract', () => {
    const result = compileReviewCardMarkdown('字'.repeat(8001), {});

    expect(result.errors).toContainEqual({
      code: 'CONTENT_LENGTH_EXCEEDED',
      message: '複習卡內容最多 8000 字',
    });
  });
});
