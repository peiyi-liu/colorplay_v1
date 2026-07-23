import { describe, expect, it } from 'vitest';

import { buildReviewCardImport } from '../../scripts/content/import-review-cards.mjs';

const fixes = {
  chapterMap: { '3': 'chapter-3' },
  reviewCardMedia: {
    '3-1:色彩的分類:有彩色與無彩色': {
      asset: '/media/review/color-wheel.svg',
      alt: '十二色相環示意圖',
    },
  },
} as const;

const fixesWithoutMedia = { chapterMap: fixes.chapterMap } as const;

const header = '章節編號,小節,子主題,卡片標題,卡片內容\n';

const csvOf = (rows: readonly string[]) => header + rows.join('\n') + '\n';

describe('review card import', () => {
  it('builds published version-1 cards with preserved multi-line content', () => {
    const csv = csvOf([
      '3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,"第一行\n\n第二行"',
      '3,3-1 色彩三要素與色名的表示,色彩三要素,甚麼是HVC,內容乙',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.problems).toEqual([]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toMatchObject({
      chapterCode: 'chapter-3',
      sectionKey: '3-1',
      groupLabel: '色彩的分類',
      title: '有彩色與無彩色',
      sortOrder: 1,
    });
    expect(result.cards[0]?.content).toBe('第一行\n\n第二行');
    expect(result.seedSql).toContain("'published'");
    expect(result.seedSql).toContain('on conflict (id) do nothing');
  });

  it('derives identical deterministic identifiers on re-import', () => {
    const csv = csvOf([
      '3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲',
    ]);
    const first = buildReviewCardImport({ csvText: csv, fixes });
    const second = buildReviewCardImport({ csvText: csv, fixes });

    expect(first.cards[0]?.id).toBe(second.cards[0]?.id);
    expect(first.cards[0]?.stableCode).toBe(second.cards[0]?.stableCode);
  });

  it('carries chapter and section forward across merged-cell rows', () => {
    const csv = csvOf([
      '3,3-2 色彩體系與數值符號的表示,色彩體系的基本結構,結構卡,內容甲',
      ',,色彩體系的分類,分類卡,內容乙',
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
      '3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲',
      '3,3-2 色彩體系與數值符號的表示,色彩體系的基本結構,,缺標題的內容',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.problems).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('卡片標題');
    expect(result.reportMd).toContain('缺標題的內容'.slice(0, 5));
  });

  it('aborts on an unmapped chapter number', () => {
    const csv = csvOf(['9,9-1 未對應章節,主題,標題,內容']);
    const result = buildReviewCardImport({
      csvText: csv,
      fixes: fixesWithoutMedia,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('9');
  });

  it('aborts on duplicate card identity within a subtopic', () => {
    const csv = csvOf([
      '3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲',
      '3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容乙',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('重複');
  });

  it('emits the draft probe card and curated media rows', () => {
    const csv = csvOf([
      '3,3-1 色彩三要素與色名的表示,色彩的分類,有彩色與無彩色,內容甲',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.seedSql).toContain("'draft'");
    expect(result.seedSql).toContain('sheet-card-draft-probe');
    expect(result.seedSql).toContain('/media/review/color-wheel.svg');
    expect(result.seedSql).toContain('十二色相環示意圖');
    expect(result.manifestTs).toContain('REVIEW_DRAFT_CARD_ID');
    expect(result.manifestTs).toContain('REVIEW_MEDIA_CARD');
    expect(result.manifestTs).toContain('REVIEW_MANIFEST');
    expect(result.reportMd).toContain('平台示意圖');
  });

  it('reports a media reference that matches no imported card as a problem', () => {
    const csv = csvOf([
      '3,3-1 色彩三要素與色名的表示,色彩三要素,甚麼是HVC,內容乙',
    ]);
    const result = buildReviewCardImport({ csvText: csv, fixes });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('reviewCardMedia');
  });
});
