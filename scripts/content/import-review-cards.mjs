#!/usr/bin/env node
/**
 * 複習卡匯入器：讀取教師試算表「各單元複習大廳」分頁（CSV），驗證後產生：
 *   1. supabase/seeds/content-review-cards.sql — 複習卡種子（sections/subtopics 補插、cards、media）
 *   2. tests/fixtures/review-manifest.generated.ts — E2E 用複習卡清單
 *   3. docs/content/review-import-report.md — 給教師的審閱報告（跳過列、媒體附件）
 *
 * 用法：
 *   node scripts/content/import-review-cards.mjs [csv 路徑]
 *   node scripts/content/import-review-cards.mjs --url   # 直接抓公開試算表
 *
 * 資料規則：試算表為主來源；合併儲存格造成的空白「章節編號／小節」自動承上。
 * 缺必填欄位的列跳過並列入報告；結構性錯誤（未對應章節、重複卡片）中止匯入。
 */
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { deterministicUuid, parseCsv, sqlText } from './import-shared.mjs';
import { TEXT_LIMITS } from './validation-rules.mjs';
import { writeFormattedOutput } from './write-formatted-output.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVIEW_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1Fpdexl-CwsWw42iAW1fMUT-AqNcDCNrevGNU8gVbvlg/export?format=csv&gid=0';
const CHAPTER_IDS = {
  'chapter-1': '21000000-0000-0000-0000-000000000001',
  'chapter-2': '21000000-0000-0000-0000-000000000002',
  'chapter-3': '21000000-0000-0000-0000-000000000003',
  'chapter-4': '21000000-0000-0000-0000-000000000004',
  'chapter-5': '21000000-0000-0000-0000-000000000005',
  'chapter-6': '21000000-0000-0000-0000-000000000006',
};
const DRAFT_PROBE_CARD = {
  stableCode: 'sheet-card-draft-probe',
  title: '尚未發布的卡片',
  content: '這張卡片尚未發布，學生不應看見。',
};

const compactWhitespace = (value) => (value ?? '').replace(/\s+/gu, ' ').trim();

const normalizeContent = (value) =>
  (value ?? '')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();

export function buildReviewCardImport({ csvText, fixes, generatedAt }) {
  const stamp = generatedAt ?? new Date().toISOString();
  const rows = parseCsv(csvText)
    .slice(1)
    .filter((row) => row.some((cell) => (cell ?? '').trim() !== ''));

  const problems = [];
  const skipped = [];
  const cards = [];
  const seenIdentifiers = new Set();
  let carriedChapter = '';
  let carriedSection = '';
  // 子主題／卡片標題皆空白的列＝上一張卡的延續內容（合併儲存格語意），
  // 內容併入 currentCard，不當成獨立卡片。任何列被拒絕後 currentCard 歸零，
  // 避免後續延續列誤併到不相關的舊卡片。
  let currentCard = null;

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const identifier = compactWhitespace(raw[0]);
    const chapterCell = compactWhitespace(raw[1]);
    const sectionCell = compactWhitespace(raw[2]);
    const groupLabel = compactWhitespace(raw[3]);
    const title = compactWhitespace(raw[4]);
    const content = normalizeContent(raw[5]);
    const attachmentRef = compactWhitespace(raw[6]);

    if (chapterCell !== '') carriedChapter = chapterCell;
    if (sectionCell !== '') carriedSection = sectionCell;
    const chapter = carriedChapter;
    const sectionLabel = carriedSection;

    if (groupLabel === '' && title === '') {
      if (content === '') return;
      if (!currentCard) {
        skipped.push({
          rowNumber,
          preview: content.slice(0, 20),
          reason: '延續內容列（子主題／卡片標題皆空白）找不到前面已開始的卡片',
        });
        return;
      }
      currentCard.content = `${currentCard.content}\n\n${content}`;
      return;
    }

    const missing = [];
    if (identifier === '') missing.push('複習卡序號');
    if (chapter === '') missing.push('章節編號');
    if (sectionLabel === '') missing.push('小節');
    if (title === '') missing.push('卡片標題');
    if (content === '') missing.push('卡片內容');
    if (missing.length > 0) {
      skipped.push({
        rowNumber,
        preview: title !== '' ? title : content.slice(0, 20) || groupLabel,
        reason: `缺少必填欄位：${missing.join('、')}`,
      });
      currentCard = null;
      return;
    }

    const chapterCode = (fixes.chapterMap ?? {})[chapter];
    if (!chapterCode || !CHAPTER_IDS[chapterCode]) {
      problems.push(
        `第 ${rowNumber} 列：章節編號「${chapter}」沒有對應的平台章節（請更新 import-fixes.json 的 chapterMap）`,
      );
      currentCard = null;
      return;
    }

    const sectionKeyMatch = /^([0-9]+-[0-9]+)/u.exec(sectionLabel);
    if (!sectionKeyMatch) {
      skipped.push({
        rowNumber,
        preview: title,
        reason: `小節「${sectionLabel}」缺少 n-n 編號前綴`,
      });
      currentCard = null;
      return;
    }
    const sectionKey = sectionKeyMatch[1];

    const identifierMatch = /^RC([1-9])([1-9])([0-9]{2})$/u.exec(identifier);
    if (!identifierMatch) {
      problems.push(
        `第 ${rowNumber} 列：複習卡序號「${identifier}」格式不符 RC＋章＋小節＋兩位數題號`,
      );
      currentCard = null;
      return;
    }
    const [, identifierChapter, identifierSection] = identifierMatch;
    if (
      identifierChapter !== chapter ||
      `${identifierChapter}-${identifierSection}` !== sectionKey
    ) {
      problems.push(
        `第 ${rowNumber} 列：複習卡序號「${identifier}」與章節／小節 ${sectionKey} 不一致`,
      );
      currentCard = null;
      return;
    }

    const identity = `${sectionKey}:${groupLabel}:${title}`;
    if (seenIdentifiers.has(identifier)) {
      problems.push(`第 ${rowNumber} 列：複習卡序號「${identifier}」重複`);
      currentCard = null;
      return;
    }
    seenIdentifiers.add(identifier);

    const card = {
      id: deterministicUuid('review-card', identifier),
      stableCode: identifier,
      identity,
      chapterCode,
      sectionKey,
      sectionLabel,
      groupLabel,
      title,
      content,
      attachmentRef,
      sortOrder: 0,
    };
    cards.push(card);
    currentCard = card;
  });

  // 延續列合併後才知道最終長度，故長度檢查移到迴圈結束後統一執行。
  for (const card of cards) {
    if (card.content.length > TEXT_LIMITS.reviewCardContent) {
      problems.push(
        `卡片「${card.identity}」內容（含延續列合併後）超過 8000 字`,
      );
    }
  }

  const mediaEntries = Object.entries(fixes.reviewCardMedia ?? {})
    .filter(([key]) => key !== '$comment')
    .flatMap(([stableCode, rawMedia]) =>
      (Array.isArray(rawMedia) ? rawMedia : [rawMedia]).map((media, index) => ({
        media,
        sortOrder: index + 1,
        stableCode,
      })),
    );
  for (const { media, stableCode } of mediaEntries) {
    const card = cards.find((entry) => entry.stableCode === stableCode);
    if (!card) {
      problems.push(
        `reviewCardMedia 的「${stableCode}」找不到對應的匯入卡片（請確認試算表與 import-fixes.json 一致）`,
      );
      continue;
    }
    const attachmentAliases = card.attachmentRef
      .split(/[\s,，、/]+/u)
      .filter(Boolean);
    if (
      media.attachmentRef &&
      !attachmentAliases.includes(media.attachmentRef)
    ) {
      problems.push(
        `reviewCardMedia 的「${stableCode}」附件代號「${media.attachmentRef}」與 Sheet「${card.attachmentRef}」不一致`,
      );
    }
    if (!media.asset?.trim() || !media.alt?.trim()) {
      problems.push(
        `reviewCardMedia 的「${stableCode}」必須同時提供 asset 與 alt`,
      );
    }
    if (
      media.asset?.trim() &&
      !/^review-card-media\/[A-Za-z0-9/_-]+\.(?:png|jpe?g|webp)$/u.test(
        media.asset.trim(),
      )
    ) {
      problems.push(
        `reviewCardMedia 的「${stableCode}」asset 必須是 review-card-media bucket 的物件路徑`,
      );
    }
  }

  const bySubtopic = new Map();
  for (const card of cards) {
    const list = bySubtopic.get(card.sectionKey) ?? [];
    list.push(card);
    bySubtopic.set(card.sectionKey, list);
    card.sortOrder = list.length;
  }

  const sections = new Map();
  for (const card of cards) {
    if (!sections.has(card.sectionKey)) {
      sections.set(card.sectionKey, {
        key: card.sectionKey,
        chapterCode: card.chapterCode,
        title: card.sectionLabel,
        sortOrder: Number.parseInt(card.sectionKey.split('-')[1], 10),
        id: deterministicUuid('section', card.sectionKey),
        subtopicId: deterministicUuid('subtopic', card.sectionKey),
      });
    }
  }

  const lines = [
    '-- 由 scripts/content/import-review-cards.mjs 產生，請勿手動編輯。',
    `-- 內容來源：教師試算表「各單元複習大廳」；產生時間 ${stamp}`,
    'begin;',
    '',
    "update public.review_cards set status = 'archived', updated_at = now() where stable_code like 'sheet-card-%';",
    '',
  ];
  if (sections.size > 0) {
    lines.push(
      'insert into public.sections (id, chapter_id, stable_code, title, description, status, sort_order)',
      'values',
      [...sections.values()]
        .map(
          (s) =>
            `  (${sqlText(s.id)}, ${sqlText(CHAPTER_IDS[s.chapterCode])}, ${sqlText(`sheet-${s.key}`)}, ${sqlText(s.title)}, '', 'published', ${s.sortOrder})`,
        )
        .join(',\n'),
      'on conflict (id) do nothing;',
      '',
      'insert into public.subtopics (id, section_id, stable_code, title, description, status, sort_order)',
      'values',
      [...sections.values()]
        .map(
          (s) =>
            `  (${sqlText(s.subtopicId)}, ${sqlText(s.id)}, ${sqlText(`sheet-${s.key}-all`)}, ${sqlText(s.title)}, '', 'published', 1)`,
        )
        .join(',\n'),
      'on conflict (id) do nothing;',
      '',
    );
  }

  const cardValues = cards.map((card) => {
    const section = sections.get(card.sectionKey);
    return `  (${sqlText(card.id)}, ${sqlText(section.subtopicId)}, ${sqlText(card.stableCode)}, ${sqlText(card.groupLabel)}, ${sqlText(card.title)}, ${sqlText(card.content)}, 1, 'published', false, ${card.sortOrder})`;
  });
  const cardGuardValues = cards.map((card) => {
    const section = sections.get(card.sectionKey);
    const media = mediaEntries
      .filter((entry) => entry.stableCode === card.stableCode)
      .map((entry) => ({
        alt_text: entry.media.alt,
        asset_path: entry.media.asset,
        sort_order: entry.sortOrder,
      }));
    return `  (${sqlText(card.id)}, ${sqlText(section.subtopicId)}, ${sqlText(card.stableCode)}, ${sqlText(card.groupLabel)}, ${sqlText(card.title)}, ${sqlText(card.content)}, ${card.sortOrder}, ${sqlText(JSON.stringify(media))}::jsonb)`;
  });
  if (cardGuardValues.length > 0) {
    lines.push(
      'do $$',
      'begin',
      '  if exists (',
      '    with incoming (id, subtopic_id, stable_code, group_label, title, content, sort_order, media) as (',
      '      values',
      cardGuardValues.join(',\n'),
      '    )',
      '    select 1',
      '    from incoming',
      '    join public.review_cards existing',
      '      on existing.id = incoming.id::uuid or existing.stable_code = incoming.stable_code',
      "    where existing.status <> 'published' or existing.version <> 1",
      '      or row(existing.subtopic_id, existing.stable_code, existing.group_label, existing.title, existing.content, existing.sort_order)',
      '        is distinct from row(incoming.subtopic_id::uuid, incoming.stable_code, incoming.group_label, incoming.title, incoming.content, incoming.sort_order)',
      '      or coalesce((',
      "        select jsonb_agg(jsonb_build_object('asset_path', media.asset_path, 'alt_text', media.alt_text, 'sort_order', media.sort_order) order by media.sort_order)",
      '        from public.review_card_media media',
      '        where media.review_card_id = existing.id and media.card_version = existing.version',
      "      ), '[]'::jsonb) is distinct from incoming.media",
      '  ) then',
      "    raise exception using errcode = 'P0001', message = 'CONTENT_VERSION_REQUIRED';",
      '  end if;',
      'end',
      '$$;',
      '',
    );
  }
  const firstSection = [...sections.values()][0];
  if (firstSection) {
    cardValues.push(
      `  (${sqlText(deterministicUuid('review-card', DRAFT_PROBE_CARD.stableCode))}, ${sqlText(firstSection.subtopicId)}, ${sqlText(DRAFT_PROBE_CARD.stableCode)}, '', ${sqlText(DRAFT_PROBE_CARD.title)}, ${sqlText(DRAFT_PROBE_CARD.content)}, 1, 'draft', false, 99)`,
    );
  }
  if (cardValues.length > 0) {
    lines.push(
      'insert into public.review_cards (id, subtopic_id, stable_code, group_label, title, content, version, status, requires_recompletion, sort_order)',
      'values',
      `${cardValues.join(',\n')}`,
      'on conflict do nothing;',
      '',
    );
  }

  const mediaValues = [];
  for (const { media, sortOrder, stableCode } of mediaEntries) {
    const card = cards.find((entry) => entry.stableCode === stableCode);
    if (!card) continue;
    mediaValues.push(
      `  (${sqlText(card.id)}, 1, ${sqlText(media.asset)}, ${sqlText(media.alt)}, ${String(sortOrder)})`,
    );
  }
  if (mediaValues.length > 0) {
    lines.push(
      'insert into public.review_card_media (review_card_id, card_version, asset_path, alt_text, sort_order)',
      'values',
      `${mediaValues.join(',\n')}`,
      'on conflict do nothing;',
      '',
    );
  }
  lines.push('commit;', '');
  const seedSql = lines.join('\n');

  const manifestEntries = [...sections.values()].map((section) => {
    const sectionCards = bySubtopic.get(section.key) ?? [];
    return {
      chapterCode: section.chapterCode,
      sectionKey: section.key,
      subtopicId: section.subtopicId,
      cardCount: sectionCards.length,
      cardTitles: sectionCards.map((card) => card.title),
    };
  });
  const mediaCard =
    mediaEntries.length > 0
      ? (() => {
          const card = cards.find(
            (entry) => entry.stableCode === mediaEntries[0].stableCode,
          );
          return card
            ? { alt: mediaEntries[0].media.alt, title: card.title }
            : null;
        })()
      : null;
  const manifestTs = [
    '// 由 scripts/content/import-review-cards.mjs 產生，請勿手動編輯。',
    '// E2E 測試依此清單推導複習卡數量與標題，內容變動時測試自動適應。',
    'export type ReviewSubtopicContent = Readonly<{',
    '  chapterCode: string;',
    '  sectionKey: string;',
    '  subtopicId: string;',
    '  cardCount: number;',
    '  cardTitles: readonly string[];',
    '}>;',
    '',
    `export const REVIEW_MANIFEST: readonly ReviewSubtopicContent[] = ${JSON.stringify(manifestEntries, null, 2)};`,
    '',
    `export const REVIEW_DRAFT_CARD_ID = ${JSON.stringify(deterministicUuid('review-card', DRAFT_PROBE_CARD.stableCode))};`,
    '',
    `export const REVIEW_MEDIA_CARD: Readonly<{ alt: string; title: string }> | null = ${JSON.stringify(mediaCard)};`,
    '',
  ].join('\n');

  const reportMd = [
    '# 複習卡匯入審閱報告',
    '',
    `產生時間：${stamp}`,
    '',
    `已產生 ${cards.length} 張卡片的 published 匯入資料：${[
      ...sections.values(),
    ]
      .map((s) => `${s.key} ${bySubtopic.get(s.key)?.length ?? 0} 張`)
      .join('、')}。`,
    '',
    '## 需要教師處理的項目',
    '',
    '### 跳過的列（請在試算表補齊後重跑 `pnpm content:import`）',
    ...skipped.map(
      (entry) =>
        `- 第 ${entry.rowNumber} 列（${entry.preview}）：${entry.reason}`,
    ),
    '',
    '### 媒體附件與待補素材代號',
    ...mediaEntries.map(
      ({ media, stableCode }) =>
        `- ${stableCode}（Sheet 代號：${media.attachmentRef ?? '未填'}）：${media.asset}（alt：${media.alt}）`,
    ),
    ...cards
      .filter(
        (card) =>
          card.attachmentRef !== '' &&
          !mediaEntries.some((media) => media.stableCode === card.stableCode),
      )
      .map(
        (card) =>
          `- ${card.stableCode}：Sheet 僅提供附件標示「${card.attachmentRef}」，未提供可匯入的圖片網址與替代文字，故未建立媒體列`,
      ),
    '',
    '## Stable code disposition ledger',
    '',
    'Disposition `owner_ssot_accepted` 表示此 stable code 來自 owner 維護的最新版 Google Sheet，並已通過本次結構 gate；圖片代號不等於圖片已入庫。',
    '',
    ...cards.map((card) => `- ${card.stableCode}: owner_ssot_accepted`),
    '',
  ].join('\n');

  return { cards, manifestTs, problems, reportMd, seedSql, skipped };
}

async function main() {
  const fixes = JSON.parse(
    readFileSync(
      join(projectRoot, 'scripts/content/import-fixes.json'),
      'utf8',
    ),
  );
  const arg = process.argv[2];
  let csvText;
  if (!arg || arg === '--url') {
    const response = await globalThis.fetch(REVIEW_SHEET_URL, {
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `無法下載試算表（HTTP ${response.status}）；請確認共用設定為公開`,
      );
    }
    csvText = await response.text();
  } else {
    csvText = readFileSync(arg, 'utf8');
  }

  const result = buildReviewCardImport({ csvText, fixes });
  if (result.problems.length > 0) {
    console.error('匯入中止，請先修正下列問題：');
    for (const problem of result.problems) console.error(` - ${problem}`);
    process.exit(1);
  }

  mkdirSync(join(projectRoot, 'supabase/seeds'), { recursive: true });
  writeFileSync(
    join(projectRoot, 'supabase/seeds/content-review-cards.sql'),
    result.seedSql,
  );
  await writeFormattedOutput({
    filePath: join(projectRoot, 'tests/fixtures/review-manifest.generated.ts'),
    source: result.manifestTs,
  });
  mkdirSync(join(projectRoot, 'docs/content'), { recursive: true });
  await writeFormattedOutput({
    filePath: join(projectRoot, 'docs/content/review-import-report.md'),
    source: result.reportMd,
  });

  console.log(
    `匯入完成：${result.cards.length} 張 published、1 張 draft（RLS 測試用）、跳過 ${result.skipped.length} 列。`,
  );
  console.log(
    '輸出：supabase/seeds/content-review-cards.sql、tests/fixtures/review-manifest.generated.ts、docs/content/review-import-report.md',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
