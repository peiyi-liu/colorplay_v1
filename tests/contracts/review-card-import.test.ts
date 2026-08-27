import { describe, expect, it } from 'vitest';

import { buildReviewCardImport } from '../../scripts/content/import-review-cards.mjs';

const fixes = {
  chapterMap: { '3': 'chapter-3' },
  reviewCardMedia: {
    RC3101: {
      attachmentRef: '圖3-2',
      asset: 'review-card-media/chapter-3/P302.webp',
      alt: '十二色相環示意圖',
    },
  },
} as const;

const fixesWithoutMedia = { chapterMap: fixes.chapterMap } as const;

const header = '複習卡序號,章節編號,小節,子主題,卡片標題,卡片內容,附件\n';

const csvOf = (rows: readonly string[]) => header + rows.join('\n') + '\n';

describe('review card import', () => {
  it('builds published version-1 cards without overwriting an existing published version', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,"第一行\n\n第二行",圖3-2',
      'RC3102,3,3-1 色彩三要素與色名的表示,色彩三要素,甚麼是HVC,內容乙',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toEqual([]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toMatchObject({
      chapterCode: 'chapter-3',
      identifier: 'RC3101',
      sectionKey: '3-1',
      groupLabel: '色彩的分類',
      title: '有彩色與無彩色',
      sortOrder: 1,
      stableCode: 'RC3101',
    });
    expect(result.cards[0]?.content).toBe('第一行\n\n第二行');
    expect(result.seedSql).toContain("'published'");
    expect(result.seedSql).toContain('on conflict (id) do update');
    expect(result.seedSql).toContain('delete from public.review_card_media');
    expect(result.seedSql).toContain('CONTENT_VERSION_REQUIRED');
  });

  it('derives identical deterministic identifiers on re-import', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲,圖3-2',
    ]);
    const first = buildReviewCardImport({ csvText: csv, fixes });
    const second = buildReviewCardImport({ csvText: csv, fixes });

    expect(first.cards[0]?.id).toBe(second.cards[0]?.id);
    expect(first.cards[0]?.stableCode).toBe(second.cards[0]?.stableCode);
  });

  it('carries chapter and section forward across merged-cell rows', () => {
    const csv = csvOf([
      'RC3201,3,3-2 色彩體系與數值符號的表示,色彩體系的基本結構,結構卡,內容甲',
      'RC3202,,,色彩體系的分類,分類卡,內容乙',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toEqual([]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[1]).toMatchObject({
      sectionKey: '3-2',
      chapterCode: 'chapter-3',
      title: '分類卡',
      sortOrder: 2,
    });
  });

  it('skips incomplete rows with reasons instead of importing them', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲',
      'RC3201,3,3-2 色彩體系與數值符號的表示,色彩體系的基本結構,,缺標題的內容',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('卡片標題');
    expect(result.reportMd).toContain('缺標題的內容'.slice(0, 5));
  });

  it('aborts on an unmapped chapter number', () => {
    const csv = csvOf(['RC9101,9,9-1 未對應章節,主題,標題,內容']);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('9');
  });

  it('aborts on duplicate RC identifier', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,同名卡,內容甲',
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,另一張卡,內容乙',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('複習卡序號「RC3101」重複');
  });

  it('allows multiple cards with the same title when RC identifiers differ', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,同名卡,內容甲',
      'RC3102,3,3-1 色彩三要素與色名的表示,色彩的分類,同名卡,內容乙',
    ]);

    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toEqual([]);
    expect(result.cards.map((card) => card.stableCode)).toEqual([
      'RC3101',
      'RC3102',
    ]);
  });

  it('emits the draft probe card and curated media rows', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲,圖3-2',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.seedSql).toContain("'draft'");
    expect(result.seedSql).toContain('sheet-card-draft-probe');
    expect(result.seedSql).toContain('review-card-media/chapter-3/P302.webp');
    expect(result.seedSql).toContain('十二色相環示意圖');
    expect(result.manifestTs).toContain('REVIEW_DRAFT_CARD_ID');
    expect(result.manifestTs).toContain('REVIEW_MEDIA_CARD');
    expect(result.manifestTs).toContain('REVIEW_MANIFEST');
    expect(result.reportMd).toContain('媒體附件與待補素材代號');
  });

  it('blocks a curated media mapping when its Sheet figure alias does not match', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲,圖3-5',
    ]);

    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.problems).toContain(
      'reviewCardMedia 的「RC3101」附件代號「圖3-2」與 Sheet「圖3-5」不一致',
    );
  });

  it('records a Sheet figure label without inventing a web media asset', () => {
    const csv = csvOf([
      'RC3103,3,3-1 色彩三要素與色名的表示,色名的表示,系統色名,內容甲,圖3-2',
    ]);

    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toEqual([]);
    expect(result.seedSql).not.toContain('圖3-2');
    expect(result.reportMd).toContain(
      'Sheet 僅提供附件標示「圖3-2」，未提供可匯入的圖片網址與替代文字',
    );
  });

  it('reports a media reference that matches no imported card as a problem', () => {
    const csv = csvOf([
      'RC3102,3,3-1 色彩三要素與色名的表示,色彩三要素,甚麼是HVC,內容乙',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('reviewCardMedia');
  });

  it('rejects unsafe or environment-bound media paths', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲,圖3-2',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: {
        chapterMap: fixes.chapterMap,
        reviewCardMedia: {
          RC3101: {
            attachmentRef: '圖3-2',
            asset: 'javascript:alert(1)',
            alt: '不安全測試',
          },
        },
      },
    });

    expect(result.problems).toContain(
      'reviewCardMedia 的「RC3101」asset 必須是 review-card-media bucket 的物件路徑',
    );
  });

  it('imports multiple ordered media objects for one RC card', () => {
    const csv = csvOf([
      'RC3201,3,3-2 色彩體系與數值符號的表示,色彩體系,色彩體系,內容甲,P303 P304',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: {
        chapterMap: fixes.chapterMap,
        reviewCardMedia: {
          RC3201: [
            {
              attachmentRef: 'P303',
              asset: 'review-card-media/chapter-3/P303.webp',
              alt: 'P303 色彩體系示意圖',
            },
            {
              attachmentRef: 'P304',
              asset: 'review-card-media/chapter-3/P304.webp',
              alt: 'P304 色彩體系示意圖',
            },
          ],
        },
      },
    });

    expect(result.problems).toEqual([]);
    expect(result.seedSql).toContain(
      "'review-card-media/chapter-3/P303.webp', 'P303 色彩體系示意圖', 1",
    );
    expect(result.seedSql).toContain(
      "'review-card-media/chapter-3/P304.webp', 'P304 色彩體系示意圖', 2",
    );
  });

  it('compiles an inline Sheet media reference before writing card content', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩三要素,明度,"段落一\n\n![P301 明度階調示意圖](review-media:P301)\n\n段落二",P301',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: {
        chapterMap: fixes.chapterMap,
        reviewCardMedia: {
          RC3101: {
            attachmentRef: 'P301',
            asset: 'review-card-media/chapter-3/P301.webp',
            alt: 'P301 明度階調示意圖',
          },
        },
      },
    });

    expect(result.problems).toEqual([]);
    expect(result.cards[0]?.content).toContain(
      '![P301 明度階調示意圖](review-card-media/chapter-3/P301.webp)',
    );
    expect(result.cards[0]?.content).not.toContain('review-media:P301');
    expect(result.seedSql).not.toContain('review-media:P301');
  });

  it('rejects a fourth approved media mapping before producing import output', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩三要素,明度,只有文字,P301 P302 P303 P304',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: {
        chapterMap: fixes.chapterMap,
        reviewCardMedia: {
          RC3101: ['P301', 'P302', 'P303', 'P304'].map((reference) => ({
            attachmentRef: reference,
            asset: `review-card-media/chapter-3/${reference}.webp`,
            alt: `${reference} 圖片`,
          })),
        },
      },
    });

    expect(result.problems).toContain(
      '卡片「RC3101」：每張複習卡最多只能插入 3 張圖片',
    );
  });

  it('emits a transaction-safe chapter-3 sync for repeatable staging import', () => {
    const csv = csvOf([
      'RC3101,3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲',
    ]);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.seedSql).toContain('on conflict (id) do update');
    expect(result.seedSql).toContain('delete from public.review_card_media');
    expect(result.seedSql).toContain("set status = 'archived'");
    expect(result.seedSql).toContain("chapter.stable_code = 'chapter-3'");
  });
});
