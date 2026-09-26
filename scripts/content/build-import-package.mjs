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

const questionScope = (code) => {
  const section = /^(QB|LT)([1-9])([1-9])([0-9]{2})$/u.exec(code);
  if (section) {
    const [, kind, chapter, sectionNumber, sequence] = section;
    return {
      bankCode: `${kind}-sheet-${chapter}-${sectionNumber}`,
      kind,
      scopeCode: `sheet-${chapter}-${sectionNumber}`,
      sequence: Number(sequence),
    };
  }
  const chapter = /^CR([1-9])([0-9]{3})$/u.exec(code);
  if (chapter) {
    return {
      bankCode: `CR-chapter-${chapter[1]}`,
      kind: 'CR',
      scopeCode: `chapter-${chapter[1]}`,
      sequence: Number(chapter[2]),
    };
  }
  throw new Error(`不支援的題號：${code}`);
};

export function buildCompatibilityWorkbook(snapshot, chapterNumber = '3') {
  const workbook = XLSX.utils.book_new();
  const rows = Object.fromEntries(
    Object.entries(headers).map(([name, sheetHeaders]) => [
      name,
      [sheetHeaders],
    ]),
  );
  const chapterPrefix = `chapter-${chapterNumber}`;
  const attachmentWarnings = [];

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
    if (!scope.scopeCode.includes(`-${chapterNumber}`)) continue;
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
