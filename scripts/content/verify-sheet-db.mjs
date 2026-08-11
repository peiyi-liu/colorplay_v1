#!/usr/bin/env node
/**
 * 表↔庫比對器（題庫 SSOT 稽核）：Google Sheet 題庫 vs Supabase 正式庫。
 * 逐題比對題幹／選項／正解／解析與複習卡內容，一律用
 * md5(去除全形半形空白) 指紋，排版差異不算差異。
 *
 * 內建防呆：題號重複即中止、
 * 缺正解、選項文字重複、卡片缺標題、佔位列自動略過、
 * 「解析與正解疑似矛盾」啟發式提示（僅供人工覆核，不自動修正）。
 * import-fixes.json 的 verifyKnownDivergences 列管「已知差異」，不視為失敗。
 *
 * 模式：
 *   （預設）audit：任何結構錯誤或非列管差異 → exit 1
 *   --gate       ：匯入前防呆。結構錯誤 → exit 1；內容差異視為「待匯入變更」放行
 * 資料來源：
 *   --xlsx <path>     用本機 xlsx（預設下載 SSOT）
 *   --db-json <path>  用 DB 快照 JSON（離線／測試；格式同 fetchDbSnapshot 回傳值）
 * 環境變數（直連 DB 時）：SUPABASE_ACCESS_TOKEN（必要）、
 *   COLORPLAY_PROJECT_REF（預設正式專案）。金鑰只讀 env，不寫入任何輸出。
 * 輸出：docs/content/sheet-db-verify-report.md + console 摘要。
 */
import { createHash } from 'node:crypto';
import console from 'node:console';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import XLSX from 'xlsx';

import {
  extractChapterReviewRows,
  extractQuestionRows,
  extractReviewRows,
  loadRemoteWorkbook,
  toReviewCardsCsv,
} from './fetch-sheet.mjs';
import { buildReviewCardImport } from './import-review-cards.mjs';
import {
  isValidQuestionCode,
  parseQuestionIdentifier,
  resolveCorrectAnswer,
} from './validation-rules.mjs';
import { writeFormattedOutput } from './write-formatted-output.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULT_PROJECT_REF = 'onkxnkzeixpezetkmocf';
export const REPORT_PATH = 'docs/content/sheet-db-verify-report.md';

/** md5(去除全部空白，含全形空白與零寬字元)，排版差異不影響比對。 */
export function fingerprint(value) {
  return createHash('md5')
    .update(
      String(value ?? '')
        .normalize('NFC')
        .replace(/[\s\u200B\uFEFF]+/gu, ''),
    )
    .digest('hex');
}

const NEGATIVE_PROMPT_PATTERN = /不正確|錯誤|為非|不是|不屬於|不包括/u;
const EXPLICIT_ANSWER_PATTERNS = [
  /(?:正確答案|標準答案|答案|正解)[應為是]{0,2}[：:]?\s*[（(]?([A-D])[）)]?/u,
  /[故應]選\s*[（(]?([A-D])[）)]?/u,
];
const VERDICT_PATTERN =
  /(?<![A-Za-z0-9])(?:選項\s*)?([A-D])(?![A-Za-z0-9])(?:\s*(的敘述))?[^。，、；,;]{0,40}?(不正確|有誤|錯誤|是正確|正確)/gu;

/**
 * 「解析與正解疑似矛盾」啟發式（如 4-1-09：何者不正確型、正解 C，
 * 解析卻稱選項 C 的敘述是正確的）。回傳提示文字或 null；僅供人工覆核。
 */
export function detectAnswerConflict({ answer, explanation, prompt }) {
  const text = String(explanation ?? '');
  if (text === '') return null;
  for (const pattern of EXPLICIT_ANSWER_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1] !== answer) {
      return `解析明示答案為 ${match[1]}，與正解 ${answer} 不符`;
    }
  }
  const negativePrompt = NEGATIVE_PROMPT_PATTERN.test(String(prompt ?? ''));
  for (const match of text.matchAll(VERDICT_PATTERN)) {
    const [, letter, statementMarker, verdict] = match;
    const negativeVerdict =
      verdict === '不正確' || verdict === '有誤' || verdict === '錯誤';
    if (negativePrompt) {
      if (letter === answer && statementMarker && !negativeVerdict) {
        return `題目為「何者不正確」型、正解 ${answer}，解析卻稱選項 ${letter} 的敘述正確`;
      }
      if (letter !== answer && negativeVerdict) {
        return `題目為「何者不正確」型、正解 ${answer}，解析卻稱選項 ${letter} 的敘述${verdict}`;
      }
    } else if (letter === answer && negativeVerdict) {
      return `正解為 ${answer}，解析卻稱選項 ${letter} 的敘述${verdict}`;
    }
  }
  return null;
}

/**
 * 把試算表整理成可比對的快照，同時執行防呆。
 * errors 為擋匯入的結構錯誤；warnings 為需人工覆核的提示。
 */
export function buildSheetSnapshot({ fixes, workbook }) {
  const extractions = [
    extractQuestionRows(workbook),
    extractChapterReviewRows(workbook),
  ];
  const errors = extractions.flatMap((extraction) => extraction.problems);
  const warnings = [];
  const skippedCodes = [];
  const questions = [];
  const seenCodes = new Set();
  const contentSeen = new Map();

  for (const row of extractions.flatMap((extraction) => extraction.rows)) {
    const code = row.code;
    const skipReason = (fixes.skipCodes ?? {})[code];
    if (skipReason) {
      skippedCodes.push({ code, reason: skipReason });
      continue;
    }
    if (seenCodes.has(code)) {
      errors.push(
        `題號 ${code} 重複（列 ${row.rowNumber}）；系統序號必須由 Google Sheet 修正`,
      );
      continue;
    }
    seenCodes.add(code);

    if (!isValidQuestionCode(code)) {
      errors.push(`題號「${code}」格式不符 n-n-nn（列 ${row.rowNumber}）`);
      continue;
    }
    const identifier = parseQuestionIdentifier(code);
    if (
      identifier?.scope === 'section' &&
      identifier.section !== String(row.section ?? '')
    ) {
      errors.push(
        `題號 ${code} 的小節 ${identifier.section} 與小節欄「${row.section ?? ''}」不一致（列 ${row.rowNumber}）`,
      );
      continue;
    }
    if (!(fixes.chapterMap ?? {})[row.chapter]) {
      errors.push(
        `題號 ${code}：章節「${row.chapter}」沒有對應平台章節（需更新 import-fixes.json chapterMap）`,
      );
      continue;
    }
    if (row.prompt === '') {
      errors.push(`題號 ${code}：題目空白`);
      continue;
    }
    const options = ['A', 'B', 'C', 'D']
      .map((key) => ({ key, text: row.options[key] }))
      .filter((option) => option.text !== '');
    if (options.length < 2) {
      errors.push(`題號 ${code}：非空選項不足 2 個`);
      continue;
    }
    const textToKey = new Map();
    let duplicateOption = null;
    for (const option of options) {
      const optionFingerprint = fingerprint(option.text);
      if (textToKey.has(optionFingerprint)) {
        duplicateOption = `${textToKey.get(optionFingerprint)} 與 ${option.key}`;
        break;
      }
      textToKey.set(optionFingerprint, option.key);
    }
    if (duplicateOption) {
      errors.push(
        `題號 ${code}：選項 ${duplicateOption} 文字完全相同，請教師修表（或暫列 skipCodes）`,
      );
      continue;
    }
    const contentFingerprint = [
      fingerprint(row.prompt),
      ...options.map((option) => fingerprint(option.text)).sort(),
    ].join(':');
    if (contentSeen.has(contentFingerprint)) {
      errors.push(
        `題目內容重複（題幹與選項組相同）：${contentSeen.get(contentFingerprint)} 與 ${code}`,
      );
      continue;
    }
    contentSeen.set(contentFingerprint, code);
    const resolved = resolveCorrectAnswer(row.answer, options);
    if (resolved.error) {
      errors.push(
        `題號 ${code}：缺正解或正解不在選項（「${row.answer}」），請教師修表（或暫列 skipCodes）`,
      );
      continue;
    }

    const conflict = detectAnswerConflict({
      answer: resolved.key,
      explanation: row.explanation,
      prompt: row.prompt,
    });
    if (conflict) {
      warnings.push(`題號 ${code}：${conflict}，疑似矛盾，請人工覆核`);
    }

    questions.push({
      answer: resolved.key,
      code,
      explanation: row.explanation,
      options,
      prompt: row.prompt,
    });
  }

  const reviewExtraction = extractReviewRows(workbook);
  errors.push(...reviewExtraction.problems);
  const reviewImport = buildReviewCardImport({
    csvText: toReviewCardsCsv(reviewExtraction.rows),
    fixes,
  });
  errors.push(...reviewImport.problems);

  return {
    cardSkipped: reviewImport.skipped,
    errors,
    placeholders: extractions.flatMap((extraction) => extraction.placeholders),
    questions,
    reviewCards: reviewImport.cards,
    skippedCodes,
    warnings,
  };
}

const QUESTIONS_SQL = `
select q.stable_code as code, q.prompt, q.explanation,
       coalesce(
         json_agg(
           json_build_object('key', o.option_key, 'text', o.option_text, 'correct', o.is_correct)
           order by o.sort_order
         ) filter (where o.option_key is not null),
         '[]'
       ) as options
from public.questions q
left join public.question_options o on o.question_id = q.id
where q.status = 'published'
group by q.id
order by q.stable_code`;

const REVIEW_CARDS_SQL = `
select c.stable_code as "stableCode", c.title, c.content,
       c.group_label as "groupLabel", s.stable_code as "subtopicCode"
from public.review_cards c
join public.subtopics s on s.id = c.subtopic_id
where c.status = 'published'
order by c.stable_code`;

/** 以 Supabase Management API 唯讀查詢 published 內容，組成 DB 快照。 */
export async function fetchDbSnapshot({
  fetchImpl = globalThis.fetch,
  projectRef,
  token,
}) {
  const runQuery = async (label, query) => {
    const response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        body: JSON.stringify({ query }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );
    if (!response.ok) {
      throw new Error(`${label} 查詢失敗（HTTP ${response.status}）`);
    }
    return await response.json();
  };
  const [questionRows, reviewCardRows] = await Promise.all([
    runQuery('questions', QUESTIONS_SQL),
    runQuery('review_cards', REVIEW_CARDS_SQL),
  ]);
  return {
    questions: questionRows.map((row) => ({
      ...row,
      options:
        typeof row.options === 'string' ? JSON.parse(row.options) : row.options,
    })),
    reviewCards: reviewCardRows,
  };
}

/** 表↔庫逐項比對；knownDivergences 命中的差異歸入 known，不算失敗。 */
export function compareSnapshots({ db, knownDivergences, sheet }) {
  const diffs = [];
  const known = [];
  const divergences = knownDivergences ?? {};
  const classify = (code, fieldKey, fieldLabel, detail) => {
    const entry = divergences[code];
    if (entry && (entry.fields ?? []).includes(fieldKey)) {
      known.push({ code, field: fieldLabel, reason: entry.reason });
    } else {
      diffs.push({ code, detail, field: fieldLabel, kind: 'field_mismatch' });
    }
  };

  let matchedQuestions = 0;
  const dbByCode = new Map(
    db.questions.map((question) => [question.code, question]),
  );
  for (const question of sheet.questions) {
    const dbQuestion = dbByCode.get(question.code);
    if (!dbQuestion) {
      diffs.push({ code: question.code, kind: 'missing_in_db' });
      continue;
    }
    dbByCode.delete(question.code);
    let clean = true;
    if (fingerprint(question.prompt) !== fingerprint(dbQuestion.prompt)) {
      classify(question.code, 'prompt', '題幹');
      clean = false;
    }
    const dbOptions = new Map(
      dbQuestion.options.map((option) => [option.key, option]),
    );
    const sheetKeys = question.options.map((option) => option.key).join('');
    const dbKeys = [...dbOptions.keys()].sort().join('');
    if (sheetKeys !== dbKeys) {
      classify(
        question.code,
        'options',
        '選項組',
        `表 ${sheetKeys} vs 庫 ${dbKeys || '(無)'}`,
      );
      clean = false;
    } else {
      for (const option of question.options) {
        if (
          fingerprint(option.text) !==
          fingerprint(dbOptions.get(option.key).text)
        ) {
          classify(question.code, 'options', `選項${option.key}`);
          clean = false;
        }
      }
    }
    const dbAnswer = dbQuestion.options
      .filter((option) => option.correct)
      .map((option) => option.key)
      .join(',');
    if (dbAnswer !== question.answer) {
      classify(
        question.code,
        'answer',
        '正解',
        `表 ${question.answer} vs 庫 ${dbAnswer || '(無)'}`,
      );
      clean = false;
    }
    if (
      fingerprint(question.explanation) !== fingerprint(dbQuestion.explanation)
    ) {
      classify(question.code, 'explanation', '解析');
      clean = false;
    }
    if (clean) matchedQuestions += 1;
  }
  for (const code of dbByCode.keys()) {
    diffs.push({ code, kind: 'missing_in_sheet' });
  }

  let matchedCards = 0;
  const dbCards = new Map(
    db.reviewCards.map((card) => [card.stableCode, card]),
  );
  for (const card of sheet.reviewCards) {
    const dbCard = dbCards.get(card.stableCode);
    if (!dbCard) {
      diffs.push({
        code: card.stableCode,
        detail: `${card.sectionKey}「${card.title}」`,
        kind: 'missing_in_db',
      });
      continue;
    }
    dbCards.delete(card.stableCode);
    let clean = true;
    if (fingerprint(card.content) !== fingerprint(dbCard.content)) {
      classify(card.stableCode, 'content', `卡片內容（${card.title}）`);
      clean = false;
    }
    const expectedSubtopic = `sheet-${card.sectionKey}-all`;
    if (dbCard.subtopicCode !== expectedSubtopic) {
      classify(
        card.stableCode,
        'subtopic',
        '卡片歸屬小節',
        `表 ${expectedSubtopic} vs 庫 ${dbCard.subtopicCode}`,
      );
      clean = false;
    }
    if (clean) matchedCards += 1;
  }
  for (const card of dbCards.values()) {
    diffs.push({
      code: card.stableCode,
      detail: card.title,
      kind: 'missing_in_sheet',
    });
  }

  return { diffs, known, matchedCards, matchedQuestions };
}

/** exit code 規則：結構錯誤一律擋；內容差異只在 audit 模式擋。 */
export function resolveExitCode({ diffs, errors, mode }) {
  if (errors.length > 0) return 1;
  if (mode === 'audit' && diffs.length > 0) return 1;
  return 0;
}

const diffLine = (diff) => {
  if (diff.kind === 'missing_in_db')
    return `- ${diff.code}：表上有、庫內沒有${diff.detail ? `（${diff.detail}）` : ''}`;
  if (diff.kind === 'missing_in_sheet')
    return `- ${diff.code}：庫內有、表上沒有${diff.detail ? `（${diff.detail}）` : ''}`;
  return `- ${diff.code}：${diff.field} 不一致${diff.detail ? `（${diff.detail}）` : ''}`;
};

export function buildVerifyReport({
  comparison,
  dbSource,
  generatedAt,
  mode,
  reviewFlags,
  sheet,
}) {
  const stamp = generatedAt ?? new Date().toISOString();
  const lines = [
    '# 表↔庫比對報告（題庫 SSOT 稽核）',
    '',
    `產生時間：${stamp}`,
    `模式：${mode === 'gate' ? 'gate（匯入前防呆）' : 'audit（完整稽核）'}`,
    `DB 來源：${dbSource}`,
    '',
    '## 摘要',
    '',
    `- 試算表題目 ${sheet.questions.length} 題（另略過 skipCodes ${sheet.skippedCodes.length} 題、佔位列 ${sheet.placeholders.length} 列）`,
    `- 試算表複習卡 ${sheet.reviewCards.length} 張（另略過缺欄位列 ${sheet.cardSkipped.length} 列）`,
    ...(comparison
      ? [
          `- 完全一致：題目 ${comparison.matchedQuestions} 題、複習卡 ${comparison.matchedCards} 張`,
          `- 非列管差異 ${comparison.diffs.length} 項、已知差異 ${comparison.known.length} 項`,
        ]
      : ['- 未執行表↔庫比對（缺 DB 來源）']),
    `- 結構錯誤 ${sheet.errors.length} 項、人工覆核提示 ${sheet.warnings.length} 項`,
    '',
    '## 結構錯誤（擋匯入，請教師修表）',
    '',
    ...(sheet.errors.length > 0
      ? sheet.errors.map((error) => `- ${error}`)
      : ['（無）']),
    '',
    '## 疑似矛盾與人工覆核提示',
    '',
    ...(sheet.warnings.length > 0
      ? sheet.warnings.map((warning) => `- ${warning}`)
      : ['（無）']),
    ...(Object.keys(reviewFlags ?? {}).some((code) => code !== '$comment')
      ? [
          '',
          '既有列管（import-fixes.json reviewFlags）：',
          ...Object.entries(reviewFlags)
            .filter(([code]) => code !== '$comment')
            .map(([code, note]) => `- ${code}：${note}`),
        ]
      : []),
    '',
    `## 內容差異（${mode === 'gate' ? '待匯入變更' : '非預期，audit 失敗'}）`,
    '',
    ...(comparison
      ? comparison.diffs.length > 0
        ? comparison.diffs.map((diff) => diffLine(diff))
        : ['（無）']
      : ['（未比對）']),
    '',
    '## 已知差異（verifyKnownDivergences 列管，不視為失敗）',
    '',
    ...(comparison && comparison.known.length > 0
      ? comparison.known.map(
          (entry) => `- ${entry.code}：${entry.field} — ${entry.reason}`,
        )
      : ['（無）']),
    '',
    '## 自動略過明細',
    '',
    ...sheet.skippedCodes.map((entry) => `- ${entry.code}：${entry.reason}`),
    ...sheet.cardSkipped.map(
      (entry) =>
        `- 複習卡第 ${entry.rowNumber} 列（${entry.preview}）：${entry.reason}`,
    ),
    `- 佔位列（僅有解析，未出題）共 ${sheet.placeholders.length} 列`,
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const readOption = (name) => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value) {
      console.error(`${name} 需要接參數`);
      process.exit(1);
    }
    return value;
  };
  const mode = args.includes('--gate') ? 'gate' : 'audit';
  const xlsxPath = readOption('--xlsx');
  const dbJsonPath = readOption('--db-json');

  const fixes = JSON.parse(
    readFileSync(
      join(projectRoot, 'scripts/content/import-fixes.json'),
      'utf8',
    ),
  );

  const workbook = xlsxPath
    ? XLSX.readFile(xlsxPath)
    : (await loadRemoteWorkbook({})).workbook;
  const sheet = buildSheetSnapshot({ fixes, workbook });

  let comparison = null;
  let dbSource = '（未比對）';
  if (dbJsonPath) {
    const db = JSON.parse(readFileSync(dbJsonPath, 'utf8'));
    dbSource = `DB 快照 ${dbJsonPath}`;
    comparison = compareSnapshots({
      db,
      knownDivergences: fixes.verifyKnownDivergences,
      sheet,
    });
  } else {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const projectRef = process.env.COLORPLAY_PROJECT_REF ?? DEFAULT_PROJECT_REF;
    if (token) {
      const db = await fetchDbSnapshot({ projectRef, token });
      dbSource = `Supabase 專案 ${projectRef}`;
      comparison = compareSnapshots({
        db,
        knownDivergences: fixes.verifyKnownDivergences,
        sheet,
      });
    } else if (mode === 'gate') {
      console.warn(
        '⚠ 未設定 SUPABASE_ACCESS_TOKEN：略過表↔庫比對，只執行試算表防呆。',
      );
      console.warn(
        '  套用種子到正式庫前，請務必補跑 pnpm content:verify（audit 模式）。',
      );
    } else {
      console.error(
        'audit 模式需要 DB 來源：請設定 SUPABASE_ACCESS_TOKEN（或改用 --db-json 快照）。',
      );
      process.exit(1);
    }
  }

  const report = buildVerifyReport({
    comparison,
    dbSource,
    mode,
    reviewFlags: fixes.reviewFlags,
    sheet,
  });
  mkdirSync(join(projectRoot, 'docs/content'), { recursive: true });
  await writeFormattedOutput({
    filePath: join(projectRoot, REPORT_PATH),
    source: report,
  });

  console.log(
    `比對完成（${mode}）：結構錯誤 ${sheet.errors.length}、覆核提示 ${sheet.warnings.length}` +
      (comparison
        ? `、非列管差異 ${comparison.diffs.length}、已知差異 ${comparison.known.length}`
        : ''),
  );
  console.log(`報告：${REPORT_PATH}`);
  if (sheet.errors.length > 0) {
    console.error('結構錯誤（擋匯入）：');
    for (const error of sheet.errors) console.error(` - ${error}`);
  }
  if (comparison && mode === 'audit' && comparison.diffs.length > 0) {
    console.error('非列管差異：');
    for (const diff of comparison.diffs) console.error(` ${diffLine(diff)}`);
  }
  process.exit(
    resolveExitCode({
      diffs: comparison?.diffs ?? [],
      errors: sheet.errors,
      mode,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
