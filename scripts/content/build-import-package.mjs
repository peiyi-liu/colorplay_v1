#!/usr/bin/env node
/**
 * Google Sheet compatibility Adapter.
 *
 * It converts the owner workbook into the same unified XLSX contract used by
 * Content Studio. It never mutates seeds, Supabase, published content, or git.
 * The resulting package must still be previewed and explicitly committed in
 * /admin/content; commit creates drafts only.
 */
import console from 'node:console';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import XLSX from 'xlsx';

import { loadRemoteWorkbook } from './fetch-sheet.mjs';
import { buildSheetSnapshot } from './verify-sheet-db.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultOutput = join(
  projectRoot,
  'artifacts/content/colorplay-content-import.xlsx',
);

const headers = {
  Course: ['stable_code', 'title', 'description', 'sort_order'],
  Chapter: ['stable_code', 'course_code', 'title', 'description', 'sort_order'],
  Section: [
    'stable_code',
    'chapter_code',
    'title',
    'description',
    'sort_order',
  ],
  Subtopic: [
    'stable_code',
    'section_code',
    'title',
    'description',
    'sort_order',
  ],
  RC: [
    'stable_code',
    'subtopic_code',
    'group_label',
    'title',
    'content',
    'requires_recompletion',
    'sort_order',
  ],
  QB: [
    'stable_code',
    'section_code',
    'title',
    'description',
    'selection_settings',
    'sort_order',
  ],
  CR: [
    'stable_code',
    'chapter_code',
    'title',
    'description',
    'selection_settings',
    'sort_order',
  ],
  LT: [
    'stable_code',
    'section_code',
    'title',
    'description',
    'selection_settings',
    'sort_order',
  ],
  Question: [
    'stable_code',
    'bank_code',
    'prompt',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'correct_key',
    'explanation',
    'duration_seconds',
    'sort_order',
  ],
  Media: ['owner_code', 'path', 'alt_text', 'semantic_role', 'sort_order'],
};

const course = {
  description: '從光、視覺、表示法到配色的基礎課程。',
  stableCode: 'color-theory',
  title: '色彩原理',
};

const chapterCatalog = {
  1: ['色彩與光源', '理解光與色彩形成的關係。'],
  2: ['色彩與生理', '認識眼睛與視覺系統如何感受色彩。'],
  3: ['色彩表示', '使用色彩模型與數值描述顏色。'],
  4: ['色彩混色', '比較加法與減法混色。'],
  5: ['色彩心理', '探索色彩知覺與心理感受。'],
  6: ['色彩配色', '練習有目的的色彩組合。'],
};

const questionScope = (code) => {
  const section = /^(QB|LT)([1-9])([1-9])([0-9]{2})$/u.exec(code);
  if (section) {
    const [, kind, chapter, sectionNumber, sequence] = section;
    return {
      bankCode: `${kind}-sheet-${chapter}-${sectionNumber}`,
      chapter,
      kind,
      scopeCode: `sheet-${chapter}-${sectionNumber}`,
      sequence: Number(sequence),
    };
  }
  const chapter = /^CR([1-9])([0-9]{3})$/u.exec(code);
  if (chapter) {
    return {
      bankCode: `CR-chapter-${chapter[1]}`,
      chapter: chapter[1],
      kind: 'CR',
      scopeCode: `chapter-${chapter[1]}`,
      sequence: Number(chapter[2]),
    };
  }
  throw new Error(`不支援的題號：${code}`);
};

export function buildCompatibilityWorkbook(
  snapshot,
  chapterNumber = '3',
  mediaRows = [],
) {
  const workbook = XLSX.utils.book_new();
  const rows = Object.fromEntries(
    Object.entries(headers).map(([name, sheetHeaders]) => [
      name,
      [sheetHeaders],
    ]),
  );
  const chapterPrefix = `chapter-${chapterNumber}`;
  const attachmentWarnings = [];
  const chapter = chapterCatalog[chapterNumber];
  if (!chapter) throw new Error(`不支援的章節：${chapterNumber}`);
  rows.Course.push([course.stableCode, course.title, course.description, 1]);
  rows.Chapter.push([
    chapterPrefix,
    course.stableCode,
    chapter[0],
    chapter[1],
    Number(chapterNumber),
  ]);

  const sectionLabels = new Map();
  for (const card of snapshot.reviewCards) {
    if (card.chapterCode !== chapterPrefix) continue;
    sectionLabels.set(
      card.sectionKey,
      card.sectionLabel ||
        `第 ${chapterNumber} 章第 ${card.sectionKey.split('-')[1]} 節`,
    );
  }

  for (const [index, card] of snapshot.reviewCards.entries()) {
    if (card.chapterCode !== chapterPrefix) continue;
    if (card.attachmentRef !== '') attachmentWarnings.push(card.stableCode);
    rows.RC.push([
      card.stableCode,
      `sheet-${card.sectionKey}-all`,
      card.groupLabel,
      card.title,
      card.content,
      false,
      card.sortOrder || index + 1,
    ]);
  }

  const bankRows = new Map();
  for (const question of snapshot.questions) {
    const scope = questionScope(question.code);
    if (scope.chapter !== chapterNumber) continue;
    if (scope.kind !== 'CR' && !sectionLabels.has(scope.scopeCode.slice(6))) {
      const sectionNumber = scope.scopeCode.split('-').at(-1);
      sectionLabels.set(
        `${chapterNumber}-${sectionNumber}`,
        `第 ${chapterNumber} 章第 ${sectionNumber} 節`,
      );
    }
    if (question.explanation.trim() === '')
      throw new Error(`題號 ${question.code} 缺少解析，不能建立匯入套件`);
    if (!bankRows.has(scope.bankCode)) {
      bankRows.set(scope.bankCode, scope);
      rows[scope.kind].push(
        scope.kind === 'CR'
          ? [
              scope.bankCode,
              scope.scopeCode,
              `${scope.scopeCode} 章節總題庫`,
              '',
              '{}',
              1,
            ]
          : [
              scope.bankCode,
              scope.scopeCode,
              `${scope.scopeCode} ${scope.kind} 題庫`,
              '',
              '{}',
              1,
            ],
      );
    }
    const options = new Map(
      question.options.map((option) => [option.key, option.text]),
    );
    rows.Question.push([
      question.code,
      scope.bankCode,
      question.prompt,
      options.get('A') ?? '',
      options.get('B') ?? '',
      options.get('C') ?? '',
      options.get('D') ?? '',
      question.answer,
      question.explanation,
      20,
      scope.sequence,
    ]);
  }

  for (const [sectionKey, title] of [...sectionLabels.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const sectionNumber = Number(sectionKey.split('-')[1]);
    rows.Section.push([
      `sheet-${sectionKey}`,
      chapterPrefix,
      title,
      '',
      sectionNumber,
    ]);
    if (
      snapshot.reviewCards.some(
        (card) =>
          card.chapterCode === chapterPrefix && card.sectionKey === sectionKey,
      )
    ) {
      rows.Subtopic.push([
        `sheet-${sectionKey}-all`,
        `sheet-${sectionKey}`,
        title,
        '',
        1,
      ]);
    }
  }
  rows.Media.push(
    ...mediaRows.map((media) => [
      media.ownerCode,
      media.path,
      media.altText,
      media.semanticRole,
      media.sortOrder,
    ]),
  );

  for (const [name, sheetRows] of Object.entries(rows)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheetRows),
      name,
    );
  }
  return { attachmentWarnings, workbook };
}

const readOption = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
  const xlsxPath = readOption('--xlsx');
  const outputPath = resolve(readOption('--output') ?? defaultOutput);
  const chapterNumber = readOption('--chapter') ?? '3';
  const fixes = JSON.parse(
    readFileSync(
      join(projectRoot, 'scripts/content/import-fixes.json'),
      'utf8',
    ),
  );
  const workbook = xlsxPath
    ? XLSX.readFile(resolve(xlsxPath))
    : (await loadRemoteWorkbook({})).workbook;
  const snapshot = buildSheetSnapshot({ fixes, workbook });
  if (snapshot.errors.length > 0) {
    throw new Error(
      `來源內容有 ${snapshot.errors.length} 個阻擋錯誤：\n${snapshot.errors.join('\n')}`,
    );
  }
  const result = buildCompatibilityWorkbook(snapshot, chapterNumber);
  mkdirSync(dirname(outputPath), { recursive: true });
  XLSX.writeFile(result.workbook, outputPath, { compression: true });
  console.log(`已建立 Chapter ${chapterNumber} 草稿匯入套件：${outputPath}`);
  console.log(
    '下一步：在 /admin/content 預覽並確認；本指令不會寫入資料庫或發布。',
  );
  if (result.attachmentWarnings.length > 0) {
    console.warn(
      `有 ${result.attachmentWarnings.length} 張卡片含舊附件代號；請改用 media/ ZIP 與 Media sheet 上傳。`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
