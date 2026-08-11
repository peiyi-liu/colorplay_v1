#!/usr/bin/env node
/**
 * 題庫匯入器：讀取教師題庫試算表（CSV），驗證後產生：
 *   1. supabase/seeds/content-questions.sql  — 章節內容種子（sections/subtopics/questions/options、章節改名）
 *   2. tests/fixtures/question-answers.generated.ts — E2E 用「題目→正解」對照表
 *   3. tests/fixtures/content-manifest.generated.ts — E2E 用章節清單（可玩章節、題數），測試據此自動適應內容變動
 *   4. docs/content/import-review.md — 給教師的審閱報告（跳過列、待確認、解析草稿）
 *
 * 用法：
 *   node scripts/content/import-questions.mjs [csv 路徑]
 *   node scripts/content/import-questions.mjs --url   # 直接抓公開試算表
 *
 * 資料規則：試算表為主來源；scripts/content/import-fixes.json 補缺（解析草稿、
 * 跳過、章節對應）。系統序號重複時一律中止，禁止匯入器代為改號。
 *
 * AGENTS.md >500 行說明：本檔是單一 CLI 邊界，依序共享同一批已驗證 questions
 * 產生 transactional seed、hints、三個測試 fixture 與 owner 審閱報告；拆開會讓
 * 各輸出各自解析來源而增加漂移風險。可重用的解析／驗證／格式化已拆至共用模組。
 */
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { deterministicUuid, parseCsv, sqlText } from './import-shared.mjs';
import {
  isValidQuestionCode,
  parseQuestionIdentifier,
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
const usedDraftExplanations = [];
const seenCodes = new Set();
const questions = [];
const legacyAlias = (code) => {
  const match = /^QB([1-9])([1-9])([0-9]{2})$/u.exec(code);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : code;
};

for (const raw of rows) {
  // HTML 會把連續空白壓成一個空格，統一正規化避免比對不一致。
  const [code0, chapter0, section0, prompt, a, b, c, d, answer0, explanation0] =
    raw.map((cell) => (cell ?? '').replace(/\s+/gu, ' ').trim());
  let code = code0;
  const legacyCode = legacyAlias(code);
  if (fixes.skipCodes[code] ?? fixes.skipCodes[legacyCode]) {
    skipped.push({
      code,
      reason: fixes.skipCodes[code] ?? fixes.skipCodes[legacyCode],
    });
    continue;
  }
  if (seenCodes.has(code)) {
    problems.push(`題號 ${code} 重複；系統序號必須由 Google Sheet 修正`);
    continue;
  }
  seenCodes.add(code);

  if (!isValidQuestionCode(code)) {
    problems.push(
      `題號 ${code} 格式不符（需為 QB章小節兩位題號或 CR章三位題號）`,
    );
    continue;
  }
  const identifier = parseQuestionIdentifier(code);
  if (!identifier) {
    problems.push(`題號 ${code} 無法解析`);
    continue;
  }
  if (identifier.chapter !== chapter0) {
    problems.push(
      `題號 ${code} 的章節 ${identifier.chapter} 與章節欄 ${chapter0} 不一致`,
    );
    continue;
  }
  if (identifier.scope === 'section') {
    const sectionMatch = /^([0-9]+)-([0-9]+)(?:\s|$)/u.exec(section0);
    if (!sectionMatch || sectionMatch[2] !== identifier.section) {
      problems.push(
        `題號 ${code} 的小節 ${identifier.section} 與小節欄「${section0}」不一致`,
      );
      continue;
    }
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
    explanation =
      fixes.draftExplanations[code] ??
      fixes.draftExplanations[legacyCode] ??
      '';
    if (explanation) usedDraftExplanations.push(code);
  }
  if (!explanation || explanation.length > TEXT_LIMITS.explanation) {
    problems.push(
      `題號 ${code}：缺少解析（試算表與草稿檔皆無）或解析超過 2000 字`,
    );
    continue;
  }

  questions.push({
    bankKind:
      identifier.scope === 'chapter'
        ? 'chapter'
        : identifier.scope === 'section'
          ? 'section'
          : 'legacy',
    code,
    chapterCode,
    order: identifier.order,
    sectionKey: identifier.sectionKey,
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

const contentSeen = new Map();
for (const q of questions) {
  const contentKey = JSON.stringify([
    q.prompt.replace(/\s+/gu, ''),
    q.options.map(([, text]) => text.replace(/\s+/gu, '')).sort(),
  ]);
  if (contentSeen.has(contentKey)) {
    console.error(
      `題目內容重複（題幹與選項組相同）：${contentSeen.get(contentKey)} 與 ${q.code}`,
    );
    process.exit(1);
  }
  contentSeen.set(contentKey, q.code);
}

const sections = new Map();
for (const q of questions) {
  if (!sections.has(q.sectionKey)) {
    const title =
      q.bankKind === 'chapter'
        ? '章節總複習'
        : fixes.sectionTitles[q.sectionKey];
    if (!title) {
      console.error(
        `小節 ${q.sectionKey} 缺少標題，請補 import-fixes.json 的 sectionTitles`,
      );
      process.exit(1);
    }
    sections.set(q.sectionKey, {
      key: q.sectionKey,
      chapterCode: q.chapterCode,
      title:
        q.bankKind === 'chapter'
          ? `${q.sectionKey.split('-')[0]} 章節總複習`
          : `${q.sectionKey} ${title}`,
      sortOrder:
        q.bankKind === 'chapter'
          ? 999
          : Number.parseInt(q.sectionKey.split('-')[1], 10),
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
lines.push(
  `${sectionValues.join(',\n')}`,
  'on conflict (id) do update set title = excluded.title, status = excluded.status, sort_order = excluded.sort_order;',
  '',
);
lines.push(
  'insert into public.subtopics (id, section_id, stable_code, title, description, status, sort_order)',
  'values',
);
const subtopicValues = [...sections.values()].map(
  (s) =>
    `  (${sqlText(s.subtopicId)}, ${sqlText(s.id)}, ${sqlText(`sheet-${s.key}-all`)}, ${sqlText(s.title)}, '', 'published', 1)`,
);
lines.push(
  `${subtopicValues.join(',\n')}`,
  'on conflict (id) do update set title = excluded.title, status = excluded.status, sort_order = excluded.sort_order;',
  '',
);

const sectionTemplateValues = [...sections.values()]
  .filter((section) =>
    questions.some(
      (question) =>
        question.sectionKey === section.key && question.bankKind === 'section',
    ),
  )
  .map((section) => {
    const templateId = deterministicUuid('quiz-template', section.key);
    const chapterNumber = section.key.split('-')[0];
    const sectionNumber = section.key.split('-')[1];
    const count = questions.filter(
      (question) =>
        question.sectionKey === section.key && question.bankKind === 'section',
    ).length;
    return `  (${sqlText(templateId)}, ${sqlText(CHAPTER_IDS[section.chapterCode])}, ${sqlText(section.id)}, ${sqlText(`section-${section.key}-challenge`)}, ${sqlText(`${chapterNumber}-${sectionNumber} 小節挑戰`)}, ${Math.min(10, count)}, 'published')`;
  });
if (sectionTemplateValues.length > 0) {
  lines.push(
    'insert into public.quiz_templates (id, chapter_id, section_id, stable_code, title, question_count, status)',
    'values',
    `${sectionTemplateValues.join(',\n')}`,
    'on conflict (id) do update set section_id = excluded.section_id, title = excluded.title, question_count = excluded.question_count, status = excluded.status;',
    '',
  );
}

const questionValues = questions.map((q) => {
  const s = sections.get(q.sectionKey);
  const nextSort = q.order;
  return `  (${sqlText(deterministicUuid('question', q.code))}, ${sqlText(s.subtopicId)}, ${sqlText(q.code)}, ${sqlText(q.bankKind)}, ${sqlText(q.prompt)}, ${sqlText(q.explanation)}, 'published', ${nextSort})`;
});
const questionGuardValues = questions.map((q) => {
  const section = sections.get(q.sectionKey);
  const options = q.options.map(([key, text], index) => ({
    is_correct: key === q.answer,
    key,
    sort_order: index + 1,
    text,
  }));
  return `  (${sqlText(deterministicUuid('question', q.code))}, ${sqlText(section.subtopicId)}, ${sqlText(q.code)}, ${sqlText(q.bankKind)}, ${sqlText(q.prompt)}, ${sqlText(q.explanation)}, ${q.order}, ${sqlText(JSON.stringify(options))}::jsonb)`;
});
lines.push(
  'do $$',
  'begin',
  '  if exists (',
  '    with incoming (id, subtopic_id, stable_code, bank_kind, prompt, explanation, sort_order, options) as (',
  '      values',
  questionGuardValues.join(',\n'),
  '    )',
  '    select 1',
  '    from incoming',
  '    join public.questions existing',
  '      on existing.id = incoming.id::uuid or existing.stable_code = incoming.stable_code',
  "    where existing.status <> 'published'",
  '      or row(existing.subtopic_id, existing.stable_code, existing.bank_kind, existing.prompt, existing.explanation, existing.sort_order)',
  '        is distinct from row(incoming.subtopic_id::uuid, incoming.stable_code, incoming.bank_kind, incoming.prompt, incoming.explanation, incoming.sort_order)',
  '      or coalesce((',
  "        select jsonb_agg(jsonb_build_object('key', option.option_key, 'text', option.option_text, 'is_correct', option.is_correct, 'sort_order', option.sort_order) order by option.sort_order)",
  '        from public.question_options option where option.question_id = existing.id',
  "      ), '[]'::jsonb) is distinct from incoming.options",
  '  ) then',
  "    raise exception using errcode = 'P0001', message = 'CONTENT_VERSION_REQUIRED';",
  '  end if;',
  'end',
  '$$;',
  '',
);
lines.push(
  'insert into public.questions (id, subtopic_id, stable_code, bank_kind, prompt, explanation, status, sort_order)',
  'values',
);
const firstSubtopicId = [...sections.values()][0].subtopicId;
questionValues.push(
  `  (${sqlText(deterministicUuid('question', DRAFT_RLS_QUESTION.code))}, ${sqlText(firstSubtopicId)}, ${sqlText(DRAFT_RLS_QUESTION.code)}, 'legacy', ${sqlText(DRAFT_RLS_QUESTION.prompt)}, ${sqlText(DRAFT_RLS_QUESTION.explanation)}, 'draft', 99)`,
);
lines.push(`${questionValues.join(',\n')}`, 'on conflict do nothing;', '');

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
lines.push(`${optionValues.join(',\n')}`, 'on conflict do nothing;', '');

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
  const question = questions.find(
    (q) => q.code === code || legacyAlias(q.code) === code,
  );
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
      `  (${sqlText(deterministicUuid('question', question.code))}, 1, ${index + 1}, ${sqlText(content)})`,
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
    `${hintValues.join(',\n')}`,
    'on conflict do nothing;',
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
const bankCounts = { chapter: 0, section: 0 };
for (const q of questions) {
  if (q.bankKind === 'chapter' || q.bankKind === 'section') {
    bankCounts[q.bankKind] += 1;
  }
  if (q.bankKind === 'chapter') {
    chapterCounts.set(
      q.chapterCode,
      (chapterCounts.get(q.chapterCode) ?? 0) + 1,
    );
  }
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
    const question = questions.find(
      (q) => q.code === code || legacyAlias(q.code) === code,
    );
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
  `已產生 ${questions.length} 題的 published 匯入資料：QB 小節題庫 ${bankCounts.section} 題、CR 章節總題庫 ${bankCounts.chapter} 題。`,
  '',
  '## 需要教師處理的項目',
  '',
  '### 跳過的列（請在試算表修正後重跑 `pnpm content:import`）',
  ...skipped.map((s) => `- ${s.code}：${s.reason}`),
  '',
  '### 標準答案待確認',
  '- 無。最新版 Sheet 結構 gate 為 0 error／0 warning；QB3238 與 QB3239 題幹相同但選項組不同，依 owner 裁定保留為兩題。',
  '',
  '### 章節對應',
  ...Object.entries(fixes.chapterMap)
    .filter(([sheetChapter]) => sheetChapter !== '$comment')
    .map(
      ([sheetChapter, chapterCode]) =>
        `- 試算表第 ${sheetChapter} 章 → 平台 ${chapterCode}`,
    ),
  '',
  '## Stable code disposition ledger',
  '',
  'Disposition `owner_ssot_accepted` 表示此 stable code 來自 owner 維護的最新版 Google Sheet，並已通過本次結構 gate；不是代理自行改寫或補題。',
  '',
  ...questions.map((q) => `- ${q.code}: owner_ssot_accepted`),
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
  `QB 小節題庫：${bankCounts.section} 題\nCR 章節總題庫：${bankCounts.chapter} 題`,
);
console.log(
  `跳過 ${skipped.length} 列、解析草稿 ${usedDraftExplanations.length} 題。`,
);
console.log(
  '輸出：supabase/seeds/content-questions.sql、tests/fixtures/question-answers.generated.ts、docs/content/import-review.md',
);
