#!/usr/bin/env node
/**
 * 題庫匯入器：讀取教師題庫試算表（CSV），驗證後產生：
 *   1. supabase/seeds/content-questions.sql  — 章節內容種子（sections/subtopics/questions/options、章節改名）
 *   2. tests/fixtures/question-answers.generated.ts — E2E 用「題目→正解」對照表
 *   3. tests/fixtures/content-manifest.generated.ts — E2E 用章節清單（可玩章節、題數），測試據此自動適應內容變動
 *   4. docs/content/import-review.md — 給教師的審閱報告（跳過列、改號、待確認、解析草稿）
 *
 * 用法：
 *   node scripts/content/import-questions.mjs [csv 路徑]
 *   node scripts/content/import-questions.mjs --url   # 直接抓公開試算表
 *
 * 資料規則：試算表為主來源；scripts/content/import-fixes.json 補缺（解析草稿、
 * 改號、跳過、章節對應）。試算表填了解析後以試算表為準。
 */
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { deterministicUuid, parseCsv, sqlText } from './import-shared.mjs';
import {
  isValidQuestionCode,
  resolveCorrectAnswer,
  TEXT_LIMITS,
} from './validation-rules.mjs';
import { writeFormattedOutput } from './write-formatted-output.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1Fpdexl-CwsWw42iAW1fMUT-AqNcDCNrevGNU8gVbvlg/export?format=csv&gid=1768427356';
const CHAPTER_IDS = {
  'chapter-1': '21000000-0000-0000-0000-000000000001',
  'chapter-2': '21000000-0000-0000-0000-000000000002',
  'chapter-3': '21000000-0000-0000-0000-000000000003',
  'chapter-4': '21000000-0000-0000-0000-000000000004',
  'chapter-5': '21000000-0000-0000-0000-000000000005',
  'chapter-6': '21000000-0000-0000-0000-000000000006',
};
const DRAFT_RLS_QUESTION = {
  code: '9-9-01',
  prompt: '這是一題尚未發布的內容，學生不應看見。',
  explanation: '草稿題僅供 RLS 負向測試。',
  options: [
    { key: 'A', text: '選項一', correct: true },
    { key: 'B', text: '選項二', correct: false },
  ],
};

const fixes = JSON.parse(
  readFileSync(join(projectRoot, 'scripts/content/import-fixes.json'), 'utf8'),
);

async function loadCsv() {
  const arg = process.argv[2];
  if (!arg || arg === '--url') {
    const response = await globalThis.fetch(SHEET_URL, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(
        `無法下載試算表（HTTP ${response.status}）；請確認共用設定為公開`,
      );
    }
    return await response.text();
  }
  return readFileSync(arg, 'utf8');
}

const csv = await loadCsv();
const rows = parseCsv(csv)
  .slice(1)
  .filter((row) => row.some((cell) => cell.trim() !== ''));

const problems = [];
const skipped = [];
const renamed = [];
const usedDraftExplanations = [];
const seenCodes = new Set();
const questions = [];

for (const raw of rows) {
  // HTML 會把連續空白壓成一個空格，統一正規化避免比對不一致。
  const [code0, chapter0, section0, prompt, a, b, c, d, answer0, explanation0] =
    raw.map((cell) => (cell ?? '').replace(/\s+/gu, ' ').trim());
  let code = code0;
  if (fixes.skipCodes[code]) {
    skipped.push({ code, reason: fixes.skipCodes[code] });
    continue;
  }
  if (seenCodes.has(code)) {
    const renameTo = fixes.duplicateRenames[code];
    if (!renameTo || seenCodes.has(renameTo)) {
      problems.push(`題號 ${code} 重複且沒有可用的改號設定`);
      continue;
    }
    renamed.push({ from: code, to: renameTo });
    code = renameTo;
  }
  seenCodes.add(code);

  if (!isValidQuestionCode(code)) {
    problems.push(`題號 ${code} 格式不符（需為 n-n-nn）`);
    continue;
  }
  const chapterCode = fixes.chapterMap[chapter0];
  if (!chapterCode || !CHAPTER_IDS[chapterCode]) {
    problems.push(`題號 ${code}：章節編號「${chapter0}」沒有對應的平台章節`);
    continue;
  }
  if (!prompt || prompt.length > TEXT_LIMITS.prompt) {
    problems.push(`題號 ${code}：題目空白或超過 1000 字`);
    continue;
  }
  const options = [
    ['A', a],
    ['B', b],
    ['C', c],
    ['D', d],
  ].filter(([, text]) => text !== '');
  if (
    options.length < 2 ||
    options.some(([, text]) => text.length > TEXT_LIMITS.optionText)
  ) {
    problems.push(`題號 ${code}：選項不足 2 個或超過 500 字`);
    continue;
  }
  const resolved = resolveCorrectAnswer(
    answer0,
    options.map(([key, text]) => ({ key, text })),
  );
  if (resolved.error) {
    problems.push(`題號 ${code}：正確答案「${answer0}」不在選項中`);
    continue;
  }
  const answer = resolved.key;
  let explanation = explanation0;
  if (!explanation) {
    explanation = fixes.draftExplanations[code] ?? '';
    if (explanation) usedDraftExplanations.push(code);
  }
  if (!explanation || explanation.length > TEXT_LIMITS.explanation) {
    problems.push(
      `題號 ${code}：缺少解析（試算表與草稿檔皆無）或解析超過 2000 字`,
    );
    continue;
  }

  const sectionKey = code.split('-').slice(0, 2).join('-');
  questions.push({
    code,
    chapterCode,
    sectionKey,
    sectionLabel: section0,
    prompt,
    options,
    answer,
    explanation,
  });
}

if (problems.length > 0) {
  console.error('匯入中止，請先修正下列問題：');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

const promptSeen = new Map();
for (const q of questions) {
  if (promptSeen.has(q.prompt)) {
    console.error(`題目文字重複：${promptSeen.get(q.prompt)} 與 ${q.code}`);
    process.exit(1);
  }
  promptSeen.set(q.prompt, q.code);
}

const sections = new Map();
for (const q of questions) {
  if (!sections.has(q.sectionKey)) {
    const title = fixes.sectionTitles[q.sectionKey];
    if (!title) {
      console.error(
        `小節 ${q.sectionKey} 缺少標題，請補 import-fixes.json 的 sectionTitles`,
      );
      process.exit(1);
    }
    sections.set(q.sectionKey, {
      key: q.sectionKey,
      chapterCode: q.chapterCode,
      title: `${q.sectionKey} ${title}`,
      sortOrder: Number.parseInt(q.sectionKey.split('-')[1], 10),
      id: deterministicUuid('section', q.sectionKey),
      subtopicId: deterministicUuid('subtopic', q.sectionKey),
    });
  }
}

const lines = [
  '-- 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。',
  `-- 內容來源：教師題庫試算表；產生時間 ${new Date().toISOString()}`,
  'begin;',
  '',
  'insert into public.sections (id, chapter_id, stable_code, title, description, status, sort_order)',
  'values',
];
const sectionValues = [...sections.values()].map(
  (s) =>
    `  (${sqlText(s.id)}, ${sqlText(CHAPTER_IDS[s.chapterCode])}, ${sqlText(`sheet-${s.key}`)}, ${sqlText(s.title)}, '', 'published', ${s.sortOrder})`,
);
lines.push(`${sectionValues.join(',\n')};`, '');
lines.push(
  'insert into public.subtopics (id, section_id, stable_code, title, description, status, sort_order)',
  'values',
);
const subtopicValues = [...sections.values()].map(
  (s) =>
    `  (${sqlText(s.subtopicId)}, ${sqlText(s.id)}, ${sqlText(`sheet-${s.key}-all`)}, ${sqlText(s.title)}, '', 'published', 1)`,
);
lines.push(`${subtopicValues.join(',\n')};`, '');

lines.push(
  'insert into public.questions (id, subtopic_id, stable_code, prompt, explanation, status, sort_order)',
  'values',
);
const sortWithinSubtopic = new Map();
const questionValues = questions.map((q) => {
  const s = sections.get(q.sectionKey);
  const nextSort = (sortWithinSubtopic.get(q.sectionKey) ?? 0) + 1;
  sortWithinSubtopic.set(q.sectionKey, nextSort);
  return `  (${sqlText(deterministicUuid('question', q.code))}, ${sqlText(s.subtopicId)}, ${sqlText(q.code)}, ${sqlText(q.prompt)}, ${sqlText(q.explanation)}, 'published', ${nextSort})`;
});
const firstSubtopicId = [...sections.values()][0].subtopicId;
questionValues.push(
  `  (${sqlText(deterministicUuid('question', DRAFT_RLS_QUESTION.code))}, ${sqlText(firstSubtopicId)}, ${sqlText(DRAFT_RLS_QUESTION.code)}, ${sqlText(DRAFT_RLS_QUESTION.prompt)}, ${sqlText(DRAFT_RLS_QUESTION.explanation)}, 'draft', 99)`,
);
lines.push(`${questionValues.join(',\n')};`, '');

lines.push(
  'insert into public.question_options (question_id, option_key, option_text, is_correct, sort_order)',
  'values',
);
const optionValues = [];
for (const q of questions) {
  const questionId = deterministicUuid('question', q.code);
  q.options.forEach(([key, text], index) => {
    optionValues.push(
      `  (${sqlText(questionId)}, ${sqlText(key)}, ${sqlText(text)}, ${key === q.answer ? 'true' : 'false'}, ${index + 1})`,
    );
  });
}
for (const [index, option] of DRAFT_RLS_QUESTION.options.entries()) {
  optionValues.push(
    `  (${sqlText(deterministicUuid('question', DRAFT_RLS_QUESTION.code))}, ${sqlText(option.key)}, ${sqlText(option.text)}, ${option.correct ? 'true' : 'false'}, ${index + 1})`,
  );
}
lines.push(`${optionValues.join(',\n')};`, '');

const chapterTitleOverrides = Object.entries(fixes.chapterTitles ?? {}).filter(
  ([key]) => key !== '$comment',
);
for (const [chapterCode, override] of chapterTitleOverrides) {
  if (!CHAPTER_IDS[chapterCode]) {
    console.error(`chapterTitles 的 ${chapterCode} 不是有效章節`);
    process.exit(1);
  }
  const title = typeof override === 'string' ? override : override.title;
  const description =
    typeof override === 'string' ? null : (override.description ?? null);
  const assignments = [`title = ${sqlText(title)}`];
  if (description !== null)
    assignments.push(`description = ${sqlText(description)}`);
  lines.push(
    `update public.chapters set ${assignments.join(', ')} where stable_code = ${sqlText(chapterCode)};`,
  );
}
if (chapterTitleOverrides.length > 0) lines.push('');

lines.push('commit;', '');

mkdirSync(join(projectRoot, 'supabase/seeds'), { recursive: true });
writeFileSync(
  join(projectRoot, 'supabase/seeds/content-questions.sql'),
  lines.join('\n'),
);

// 分層提示草稿：試算表尚無提示欄位前，由 import-fixes.json 補充（level 1–3
// 依序、不得等價揭露正解），另存種子檔（載入順序在題目之後）。
const hintDraftEntries = Object.entries(fixes.hintDrafts ?? {}).filter(
  ([key]) => key !== '$comment',
);
const hintValues = [];
for (const [code, hintLevels] of hintDraftEntries) {
  const question = questions.find((q) => q.code === code);
  if (!question) {
    console.error(`hintDrafts 的題號 ${code} 不在本次匯入的題目中`);
    process.exit(1);
  }
  if (
    !Array.isArray(hintLevels) ||
    hintLevels.length < 1 ||
    hintLevels.length > 3 ||
    hintLevels.some(
      (content) =>
        typeof content !== 'string' ||
        content.trim() === '' ||
        content.length > 1000,
    )
  ) {
    console.error(
      `hintDrafts 的題號 ${code} 需為 1–3 條非空提示（各 ≤1000 字）`,
    );
    process.exit(1);
  }
  const correctText = question.options.find(
    ([key]) => key === question.answer,
  )[1];
  if (hintLevels.some((content) => content.includes(correctText))) {
    console.error(`hintDrafts 的題號 ${code} 提示不得直接包含正解文字`);
    process.exit(1);
  }
  hintLevels.forEach((content, index) => {
    hintValues.push(
      `  (${sqlText(deterministicUuid('question', code))}, 1, ${index + 1}, ${sqlText(content)})`,
    );
  });
}
const hintLines = [
  '-- 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。',
  `-- 提示為 AI 草稿（import-fixes.json hintDrafts），待教師審閱；產生時間 ${new Date().toISOString()}`,
  'begin;',
  '',
];
if (hintValues.length > 0) {
  hintLines.push(
    'insert into public.question_hints (question_id, question_version, hint_level, content)',
    'values',
    `${hintValues.join(',\n')};`,
    '',
  );
}
hintLines.push('commit;', '');
writeFileSync(
  join(projectRoot, 'supabase/seeds/content-question-hints.sql'),
  hintLines.join('\n'),
);

const fixtureLines = [
  '// 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。',
  '// E2E 測試用：published 題目的「題目文字 → 正解選項文字」對照表。',
  'export const GENERATED_CORRECT_ANSWERS: ReadonlyMap<string, string> = new Map([',
  ...questions.map((q) => {
    const correctText = q.options.find(([key]) => key === q.answer)[1];
    return `  [${JSON.stringify(q.prompt)}, ${JSON.stringify(correctText)}],`;
  }),
  ']);',
  '',
];
await writeFormattedOutput({
  filePath: join(projectRoot, 'tests/fixtures/question-answers.generated.ts'),
  source: fixtureLines.join('\n'),
});

const chapterCounts = new Map();
for (const q of questions) {
  chapterCounts.set(q.chapterCode, (chapterCounts.get(q.chapterCode) ?? 0) + 1);
}

const manifestEntries = Object.keys(CHAPTER_IDS).map((chapterCode) => {
  const chapterNumber = Number.parseInt(chapterCode.split('-')[1], 10);
  return {
    chapterCode,
    chapterNumber,
    questionCount: chapterCounts.get(chapterCode) ?? 0,
    templateId: `26000000-0000-0000-0000-00000000000${chapterNumber}`,
  };
});
const manifestLines = [
  '// 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。',
  '// E2E 測試依此清單推導「哪些章節可玩、各有幾題」，內容變動時測試自動適應。',
  'export type ChapterContent = Readonly<{',
  '  chapterCode: string;',
  '  chapterNumber: number;',
  '  questionCount: number;',
  '  templateId: string;',
  '}>;',
  '',
  `export const CONTENT_MANIFEST: readonly ChapterContent[] = ${JSON.stringify(manifestEntries, null, 2)};`,
  '',
];
await writeFormattedOutput({
  filePath: join(projectRoot, 'tests/fixtures/content-manifest.generated.ts'),
  source: manifestLines.join('\n'),
});

const hintFixtureLines = [
  '// 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。',
  '// E2E 測試用：有分層提示的題目「題目文字 → 各層提示內容」對照表。',
  'export const GENERATED_QUESTION_HINTS: ReadonlyMap<',
  '  string,',
  '  readonly string[]',
  '> = new Map([',
  ...hintDraftEntries.map(([code, hintLevels]) => {
    const question = questions.find((q) => q.code === code);
    return `  [${JSON.stringify(question.prompt)}, ${JSON.stringify(hintLevels)}],`;
  }),
  ']);',
  '',
];
await writeFormattedOutput({
  filePath: join(projectRoot, 'tests/fixtures/question-hints.generated.ts'),
  source: hintFixtureLines.join('\n'),
});
const reviewLines = [
  '# 題庫匯入審閱報告',
  '',
  `產生時間：${new Date().toISOString()}`,
  '',
  `已匯入 ${questions.length} 題（published）：${[...chapterCounts.entries()]
    .map(([chapterName, count]) => `${chapterName} ${count} 題`)
    .join('、')}。`,
  '',
  '## 需要教師處理的項目',
  '',
  '### 跳過的列（請在試算表修正後重跑 `pnpm content:import`）',
  ...skipped.map((s) => `- ${s.code}：${s.reason}`),
  '',
  '### 自動改號',
  ...renamed.map(
    (r) => `- ${r.from} 第二次出現 → 已改為 ${r.to}（請同步修正試算表）`,
  ),
  '',
  '### 標準答案待確認',
  ...Object.entries(fixes.reviewFlags).map(
    ([code, note]) => `- ${code}：${note}`,
  ),
  '',
  '### 章節對應',
  ...Object.entries(fixes.chapterMap).map(
    ([sheetChapter, chapterCode]) =>
      `- 試算表第 ${sheetChapter} 章 → 平台 ${chapterCode}`,
  ),
  '',
  `## AI 起草的解析（共 ${usedDraftExplanations.length} 題，請審閱後填回試算表）`,
  '',
  '審閱方式：以下解析已匯入平台。建議把確認過的文字貼回試算表「答錯觀念解析」欄，',
  '之後重跑匯入時就會以試算表為準。',
  '',
  ...questions
    .filter((q) => usedDraftExplanations.includes(q.code))
    .map((q) => `- **${q.code}**（答案 ${q.answer}）：${q.explanation}`),
  '',
  `## AI 起草的分層提示（共 ${hintDraftEntries.length} 題，請審閱）`,
  '',
  '提示依 level 1–3 由淺入深，作答前由學生逐層請求；不得等價揭露正解。',
  '確認或修改後請告知，未來試算表新增提示欄位時以試算表為準。',
  '',
  ...hintDraftEntries.flatMap(([code, hintLevels]) => [
    `- **${code}**：`,
    ...hintLevels.map((content, index) => `  ${index + 1}. ${content}`),
  ]),
  '',
];
mkdirSync(join(projectRoot, 'docs/content'), { recursive: true });
await writeFormattedOutput({
  filePath: join(projectRoot, 'docs/content/import-review.md'),
  source: reviewLines.join('\n'),
});

console.log(
  `匯入完成：${questions.length} 題 published、1 題 draft（RLS 測試用）。`,
);
console.log(
  [...chapterCounts.entries()]
    .map(([chapterName, count]) => `${chapterName}: ${count} 題`)
    .join('\n'),
);
console.log(
  `跳過 ${skipped.length} 列、改號 ${renamed.length} 筆、解析草稿 ${usedDraftExplanations.length} 題。`,
);
console.log(
  '輸出：supabase/seeds/content-questions.sql、tests/fixtures/question-answers.generated.ts、docs/content/import-review.md',
);
