#!/usr/bin/env node
/**
 * 題庫 SSOT 下載器：從 owner 裁定的 Google Sheet（唯一內容來源）下載整份
 * xlsx，轉成既有匯入器可直接讀取的 CSV：
 *   artifacts/content/question-bank.xlsx — 原始快照（不進 git）
 *   artifacts/content/questions.csv      — 「各單元隨機測驗題庫」→ import-questions.mjs 10 欄格式
 *   artifacts/content/review-cards.csv   — 「各單元複習大廳」→ import-review-cards.mjs 5 欄格式
 *
 * 表頭以「去除所有空白」後比對，容忍欄名尾空格（如「選項 A 」「正確答案 」）。
 * 佔位列（題目／選項／正解全空、僅有解析）在此層過濾，不進 CSV；
 * 其餘資料不做內容修補——表上缺陷交由 verify-sheet-db.mjs 防呆與教師修表。
 *
 * 用法：
 *   node scripts/content/fetch-sheet.mjs               # 下載 SSOT 並轉檔
 *   node scripts/content/fetch-sheet.mjs --xlsx 路徑   # 用本機 xlsx（離線／測試）
 */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import XLSX from 'xlsx';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SHEET_XLSX_URL =
  'https://docs.google.com/spreadsheets/d/1Fpdexl-CwsWw42iAW1fMUT-AqNcDCNrevGNU8gVbvlg/export?format=xlsx';
export const QUESTION_TAB_NAME = '各單元隨機測驗題庫';
export const REVIEW_TAB_NAME = '各單元複習大廳';
export const OUTPUT_DIR = 'artifacts/content';

const QUESTION_CSV_HEADER = [
  '題號',
  '章節',
  '小節',
  '題目',
  '選項A',
  '選項B',
  '選項C',
  '選項D',
  '正確答案',
  '答錯觀念解析',
];
const REVIEW_CSV_HEADER = ['章節編號', '小節', '子主題', '卡片標題', '卡片內容'];

const normalizeHeader = (value) => String(value ?? '').replace(/\s+/gu, '');

const cellText = (value) => String(value ?? '').trim();

// 題號欄教師直接填數值（如 3110 = 第3章第1節第10題），轉為匯入器與 DB
// 預期的 n-n-nn 格式；已是 n-n-nn 或無法辨識的內容原樣保留，交由
// validation-rules.mjs 的既有格式檢查處理。
const normalizeQuestionCode = (value) => {
  const trimmed = cellText(value);
  if (/^[0-9]-[0-9]-[0-9]{2}$/u.test(trimmed)) return trimmed;
  if (/^[0-9]{4}$/u.test(trimmed)) {
    return `${trimmed[0]}-${trimmed[1]}-${trimmed.slice(2)}`;
  }
  return trimmed;
};

// 複習卡「小節」欄同樣填數值（如 31 = 第3章第1節），轉為
// import-review-cards.mjs 的 sectionKey 正則（^n-n）預期格式；
// 已是 n-n 開頭或無法辨識的內容原樣保留。
const normalizeSectionLabel = (value) => {
  const trimmed = cellText(value);
  if (/^[0-9]-[0-9]/u.test(trimmed)) return trimmed;
  if (/^[0-9]{2}$/u.test(trimmed)) {
    return `${trimmed[0]}-${trimmed[1]}`;
  }
  return trimmed;
};

function sheetRows(workbook, tabName) {
  const sheet = workbook.Sheets[tabName];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    header: 1,
    raw: false,
  });
}

function headerIndex(headerRow, names) {
  const normalized = headerRow.map((cell) => normalizeHeader(cell));
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * 解析「各單元隨機測驗題庫」分頁。
 * 回傳 { placeholders, problems, rows }；rows 為題目列（含缺正解等待防呆列），
 * placeholders 為僅有解析的佔位列（第 1/2/5/6 章與 4-1-10 型），不進匯入。
 */
export function extractQuestionRows(workbook) {
  const aoa = sheetRows(workbook, QUESTION_TAB_NAME);
  if (!aoa || aoa.length === 0) {
    return {
      placeholders: [],
      problems: [`找不到分頁「${QUESTION_TAB_NAME}」`],
      rows: [],
    };
  }
  const headerRow = aoa[0];
  const columns = {
    answer: headerIndex(headerRow, ['正確答案', '正解']),
    chapter: headerIndex(headerRow, ['章節', '章節編號']),
    code: headerIndex(headerRow, ['題號']),
    explanation: headerIndex(headerRow, ['答錯觀念解析', '解析']),
    optionA: headerIndex(headerRow, ['選項A']),
    optionB: headerIndex(headerRow, ['選項B']),
    optionC: headerIndex(headerRow, ['選項C']),
    optionD: headerIndex(headerRow, ['選項D']),
    prompt: headerIndex(headerRow, ['題目']),
    sectionTitle: headerIndex(headerRow, ['小節標題', '小節']),
  };
  const missing = Object.entries(columns)
    .filter(([, index]) => index < 0)
    .map(([key]) => key);
  if (missing.length > 0) {
    return {
      placeholders: [],
      problems: [`題庫分頁缺少必要欄位：${missing.join('、')}`],
      rows: [],
    };
  }

  const placeholders = [];
  const rows = [];
  aoa.slice(1).forEach((raw, index) => {
    const rowNumber = index + 2;
    if (raw.every((cell) => cellText(cell) === '')) return;
    const record = {
      answer: cellText(raw[columns.answer]),
      chapter: cellText(raw[columns.chapter]),
      code: normalizeQuestionCode(raw[columns.code]),
      explanation: cellText(raw[columns.explanation]),
      options: {
        A: cellText(raw[columns.optionA]),
        B: cellText(raw[columns.optionB]),
        C: cellText(raw[columns.optionC]),
        D: cellText(raw[columns.optionD]),
      },
      prompt: cellText(raw[columns.prompt]),
      rowNumber,
      sectionTitle: cellText(raw[columns.sectionTitle]),
    };
    const hasQuestionContent =
      record.prompt !== '' ||
      record.answer !== '' ||
      Object.values(record.options).some((text) => text !== '');
    if (!hasQuestionContent) {
      placeholders.push({
        chapter: record.chapter,
        code: record.code,
        rowNumber,
      });
      return;
    }
    rows.push(record);
  });
  return { placeholders, problems: [], rows };
}

/**
 * 解析「各單元複習大廳」分頁。章欄容忍空白表頭（合併儲存格版型），
 * 列內容原樣保留（合併儲存格造成的空欄由匯入器承上處理）。
 */
export function extractReviewRows(workbook) {
  const aoa = sheetRows(workbook, REVIEW_TAB_NAME);
  if (!aoa || aoa.length === 0) {
    return { problems: [`找不到分頁「${REVIEW_TAB_NAME}」`], rows: [] };
  }
  const headerRow = aoa[0];
  const named = {
    content: headerIndex(headerRow, ['卡片內容']),
    group: headerIndex(headerRow, ['子主題']),
    section: headerIndex(headerRow, ['小節']),
    // Sheet 改版後子主題標題直接作為卡片標題（卡片內容的標題＝子主題標題），
    // 「卡片標題」欄已移除；保留舊名作為向前相容 fallback。
    title: headerIndex(headerRow, ['子主題標題', '卡片標題']),
  };
  const missing = Object.entries(named)
    .filter(([, index]) => index < 0)
    .map(([key]) => key);
  if (missing.length > 0) {
    return {
      problems: [`複習大廳分頁缺少必要欄位：${missing.join('、')}`],
      rows: [],
    };
  }
  let chapterIndex = headerIndex(headerRow, ['章', '章節', '章節編號']);
  if (chapterIndex < 0) chapterIndex = 0;

  const rows = aoa
    .slice(1)
    .filter((raw) => raw.some((cell) => cellText(cell) !== ''))
    .map((raw) => [
      cellText(raw[chapterIndex]),
      normalizeSectionLabel(raw[named.section]),
      cellText(raw[named.group]),
      cellText(raw[named.title]),
      String(raw[named.content] ?? '').trim(),
    ]);
  return { problems: [], rows };
}

export function toCsv(aoa) {
  const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${aoa.map((row) => row.map(escapeCell).join(',')).join('\n')}\n`;
}

export function toQuestionsCsv(rows) {
  return toCsv([
    QUESTION_CSV_HEADER,
    ...rows.map((row) => [
      row.code,
      row.chapter,
      row.sectionTitle,
      row.prompt,
      row.options.A,
      row.options.B,
      row.options.C,
      row.options.D,
      row.answer,
      row.explanation,
    ]),
  ]);
}

export function toReviewCardsCsv(rows) {
  return toCsv([REVIEW_CSV_HEADER, ...rows]);
}

export async function loadRemoteWorkbook({ fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(SHEET_XLSX_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `無法下載試算表（HTTP ${response.status}）；請確認共用設定為公開`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, workbook: XLSX.read(buffer, { type: 'buffer' }) };
}

async function main() {
  const xlsxArgIndex = process.argv.indexOf('--xlsx');
  const xlsxPath = xlsxArgIndex >= 0 ? process.argv[xlsxArgIndex + 1] : null;
  if (xlsxArgIndex >= 0 && !xlsxPath) {
    console.error('--xlsx 需要接檔案路徑');
    process.exit(1);
  }

  const outputDir = join(projectRoot, OUTPUT_DIR);
  mkdirSync(outputDir, { recursive: true });

  let workbook;
  if (xlsxPath) {
    workbook = XLSX.readFile(xlsxPath);
  } else {
    const loaded = await loadRemoteWorkbook({});
    workbook = loaded.workbook;
    writeFileSync(join(outputDir, 'question-bank.xlsx'), loaded.buffer);
  }

  const questionResult = extractQuestionRows(workbook);
  const reviewResult = extractReviewRows(workbook);
  const problems = [...questionResult.problems, ...reviewResult.problems];
  if (problems.length > 0) {
    console.error('下載中止，試算表結構不符：');
    for (const problem of problems) console.error(` - ${problem}`);
    process.exit(1);
  }

  writeFileSync(
    join(outputDir, 'questions.csv'),
    toQuestionsCsv(questionResult.rows),
  );
  writeFileSync(
    join(outputDir, 'review-cards.csv'),
    toReviewCardsCsv(reviewResult.rows),
  );

  console.log(
    `SSOT 下載完成：題目 ${questionResult.rows.length} 列（另過濾佔位列 ${questionResult.placeholders.length} 列）、複習卡 ${reviewResult.rows.length} 列。`,
  );
  console.log(
    `輸出：${OUTPUT_DIR}/questions.csv、${OUTPUT_DIR}/review-cards.csv${xlsxPath ? '' : `、${OUTPUT_DIR}/question-bank.xlsx`}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
