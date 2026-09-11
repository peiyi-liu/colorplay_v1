import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildReviewCardImport } from '../../scripts/content/import-review-cards.mjs';
import {
  REVIEW_MANIFEST,
  type ReviewSubtopicContent,
} from '../fixtures/review-manifest.generated';

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
async function readFixtureText(relativePath: string): Promise<string> {
  return readFile(resolve(import.meta.dirname, relativePath), 'utf8');
}
function cardTotal(): number {
  return REVIEW_MANIFEST.reduce((sum, s) => sum + s.cardCount, 0);
}
function countsBySection(
  manifest: readonly ReviewSubtopicContent[],
): Map<string, number> {
  return manifest.reduce((counts, s) => {
    counts.set(s.sectionKey, (counts.get(s.sectionKey) ?? 0) + s.cardCount);
    return counts;
  }, new Map<string, number>());
}
interface ParsedReviewImportReport {
  counts: Map<string, number>;
  total: number;
}
function need<T>(value: T | undefined, code: string): T {
  if (value === undefined) throw new Error(code);
  return value;
}
function posInt(text: string, errorCode: string): number {
  if (!/^(?:0|[1-9]\d*)$/u.test(text)) throw new Error(errorCode);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(errorCode);
  return value;
}
// Trusts only the one canonical "已產生 N 張卡片的 published 匯入資料：..." line so total/sections can never disagree.
function parseReviewImportReport(reportMd: string): ParsedReviewImportReport {
  const lineMatches = [
    ...reportMd.matchAll(
      /^已產生\s*(\d+)\s*張卡片的\s*published\s*匯入資料：(.*)$/gmu,
    ),
  ];
  if (lineMatches.length !== 1) throw new Error('REPORT_SUMMARY_NOT_UNIQUE');
  const [summaryLine] = lineMatches;
  const totalText = need(summaryLine?.[1], 'REPORT_SUMMARY_UNPARSEABLE');
  const sectionListText = need(summaryLine?.[2], 'REPORT_SUMMARY_UNPARSEABLE');
  const total = posInt(totalText, 'REPORT_TOTAL_INVALID');
  const counts = new Map<string, number>();
  for (const token of sectionListText.trim().replace(/。$/u, '').split('、')) {
    const tokenMatch = /^(\d+-\d+)\s*(\d+)\s*張$/u.exec(token.trim());
    if (tokenMatch === null) throw new Error('REPORT_TOKEN_MALFORMED');
    const sectionKey = need(tokenMatch[1], 'REPORT_TOKEN_MALFORMED');
    const countText = need(tokenMatch[2], 'REPORT_TOKEN_MALFORMED');
    if (counts.has(sectionKey)) throw new Error('REPORT_DUPLICATE_SECTION');
    counts.set(sectionKey, posInt(countText, 'REPORT_COUNT_INVALID'));
  }
  if (counts.size === 0) throw new Error('REPORT_SECTIONS_EMPTY');
  return { counts, total };
}
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// stable_code is column 3; anchoring on two leading UUID literals (id, subtopic_id) avoids stray 'RC...' text elsewhere.
const TUPLE_STABLE_CODE = new RegExp(
  `\\(\\s*'${UUID}'\\s*,\\s*'${UUID}'\\s*,\\s*'([^']*)'`,
  'gu',
);
// Anchored on the exact column list plus the bare "on conflict do nothing;" unique to this insert (others qualify with "(id)"; the incoming CTE has none).
const CANONICAL_REVIEW_CARDS_INSERT =
  /insert into public\.review_cards \(id, subtopic_id, stable_code, group_label, title, content, version, status, requires_recompletion, sort_order\)\s*values\s*([\s\S]*?)on conflict do nothing;/gu;
function parseSeedCodes(seedSql: string): string[] {
  const blockMatches = [...seedSql.matchAll(CANONICAL_REVIEW_CARDS_INSERT)];
  if (blockMatches.length !== 1) throw new Error('SEED_INSERT_NOT_UNIQUE');
  const tuplesBlock = need(blockMatches[0]?.[1], 'SEED_INSERT_UNPARSEABLE');
  const cs = [...tuplesBlock.matchAll(TUPLE_STABLE_CODE)]
    .map((found) => found[1])
    .filter((code): code is string => code !== undefined)
    .filter((code) => /^RC\d+$/u.test(code));
  if (cs.length === 0) throw new Error('SEED_CODES_EMPTY');
  if (new Set(cs).size !== cs.length) throw new Error('SEED_DUPLICATE_CODE');
  return cs;
}
const RPT = '../../docs/content/review-import-report.md';
const SEED_PATH = '../../supabase/seeds/content-review-cards.sql';
describe('review manifest generated-artifact consistency', () => {
  it('keeps every subtopicId unique with cardCount matching cardTitles', () => {
    const ids = REVIEW_MANIFEST.map((s) => s.subtopicId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      REVIEW_MANIFEST.every((s) => s.cardCount === s.cardTitles.length),
    ).toBe(true);
  });
  it('matches report total and per-section counts', async () => {
    const parsed = parseReviewImportReport(await readFixtureText(RPT));
    expect(cardTotal()).toBe(parsed.total);
    expect(countsBySection(REVIEW_MANIFEST)).toEqual(parsed.counts);
  });
  it('matches unique RC stable code count from the canonical seed insert', async () => {
    const seedSql = await readFixtureText(SEED_PATH);
    expect(cardTotal()).toBe(parseSeedCodes(seedSql).length);
  });
});
function mkTuple(code: string, index: number): string {
  const uuid = (seed: number) =>
    `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`;
  const idx = String(index);
  return `('${uuid(index * 2)}','${uuid(index * 2 + 1)}','${code}','${idx}','t','c',1,'published',false,${idx})`;
}
// Always renders the earlier validation CTE so tests can prove the canonical INSERT parses independently of it.
function mkSeed(
  canonicalCodes: readonly string[] | undefined,
  options: { dup?: boolean; incoming?: readonly string[]; noise?: string } = {},
): string {
  const incoming = (options.incoming ?? ['RC1', 'RC2'])
    .map(mkTuple)
    .join(',\n');
  const canonicalBlock =
    canonicalCodes === undefined
      ? ''
      : `insert into public.review_cards (id, subtopic_id, stable_code, group_label, title, content, version, status, requires_recompletion, sort_order)\nvalues\n${canonicalCodes.map(mkTuple).join(',\n')}\non conflict do nothing;\n`;
  return [
    `do $$ begin if exists (with incoming (id, subtopic_id, stable_code, group_label, title, content, sort_order, media) as (values\n${incoming}\n) select 1 from incoming) then raise exception using message = 'noop'; end if; end $$;`,
    canonicalBlock,
    options.dup === true ? canonicalBlock : '',
    options.noise ?? '',
  ].join('\n');
}
type SeedOpts = Parameters<typeof mkSeed>[1];
const seedCode =
  (codes: readonly string[] | undefined, extra?: SeedOpts) => () =>
    parseSeedCodes(mkSeed(codes, extra));
const reportCode = (md: string) => () => parseReviewImportReport(md);
describe('review-import parsers: accept well-formed input, fail closed on ambiguous input', () => {
  const acceptCases: [string, () => unknown, unknown][] = [
    [
      'seed: counts only the canonical insert, not the earlier incoming CTE',
      seedCode(['RC1', 'RC2'], { incoming: ['RC1', 'RC2', 'RC3'] }),
      ['RC1', 'RC2'],
    ],
    [
      'seed: ignores an RC-shaped string in a comment or card content',
      seedCode(['RC1', 'RC2'], { noise: "-- RC9999 'RC9999'" }),
      ['RC1', 'RC2'],
    ],
  ];
  it.each(acceptCases)('accepts: %s', (_label, run, expected) => {
    expect(run()).toEqual(expected);
  });
  const rejectCases: [string, () => unknown, string][] = [
    [
      'report: two contradictory published summary lines',
      reportCode(
        '已產生 1 張卡片的 published 匯入資料：3-1 1 張。\n已產生 2 張卡片的 published 匯入資料：3-1 2 張。',
      ),
      'REPORT_SUMMARY_NOT_UNIQUE',
    ],
    [
      'report: duplicate sectionKey inside the summary line',
      reportCode('已產生 8 張卡片的 published 匯入資料：3-1 3 張、3-1 3 張。'),
      'REPORT_DUPLICATE_SECTION',
    ],
    [
      'report: malformed trailing section token',
      reportCode('已產生 8 張卡片的 published 匯入資料：3-1 3 張 extra。'),
      'REPORT_TOKEN_MALFORMED',
    ],
    [
      'seed: canonical insert block is missing',
      seedCode(undefined),
      'SEED_INSERT_NOT_UNIQUE',
    ],
    [
      'seed: canonical insert block appears more than once',
      seedCode(['RC1'], { dup: true }),
      'SEED_INSERT_NOT_UNIQUE',
    ],
    [
      'seed: stable code repeated within the canonical insert',
      seedCode(['RC1', 'RC1']),
      'SEED_DUPLICATE_CODE',
    ],
  ];
  it.each(rejectCases)('rejects: %s', (_label, run, sentinel) => {
    expect(run).toThrow(sentinel);
  });
});
