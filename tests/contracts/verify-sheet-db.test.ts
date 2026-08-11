import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx';

import {
  CHAPTER_REVIEW_TAB_NAME,
  QUESTION_TAB_NAME,
  REVIEW_TAB_NAME,
} from '../../scripts/content/fetch-sheet.mjs';
import {
  buildSheetSnapshot,
  compareSnapshots,
  detectAnswerConflict,
  fingerprint,
  resolveExitCode,
  type DbSnapshot,
} from '../../scripts/content/verify-sheet-db.mjs';

const HEADER = [
  '題號',
  '章節',
  '章節標題',
  '小節',
  '小節標題',
  '題目',
  '選項 A ',
  '選項 B ',
  '選項 C',
  '選項 D',
  '正確答案 ',
  '答錯觀念解析',
];

const question = (
  code: string,
  overrides: Readonly<
    Partial<Record<'answer' | 'explanation' | 'prompt', string>>
  > = {},
  options: readonly string[] = ['明色', '中間色', '濁色', '暗色'],
) => [
  code,
  code.split('-')[0] ?? '3',
  '章名',
  '31',
  '小節名',
  overrides.prompt ?? `${code} 的題目？`,
  ...options,
  overrides.answer ?? 'D',
  overrides.explanation ?? `${code} 的解析。`,
];

function makeWorkbook(
  questionRows: readonly (readonly string[])[],
  reviewRows: readonly (readonly string[])[] = [],
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([HEADER, ...questionRows.map((row) => [...row])]),
    QUESTION_TAB_NAME,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['複習卡序號', ' ', '小節', '子主題', '卡片標題', '卡片內容'],
      ...reviewRows.map((row, index) => [
        `RC31${String(index + 1).padStart(2, '0')}`,
        ...row,
      ]),
    ]),
    REVIEW_TAB_NAME,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        '總章節題庫序號',
        '章節',
        '章節標題',
        '題目',
        '選項 A ',
        '選項 B ',
        '選項 C',
        '選項 D',
        '正確答案 ',
        '答錯觀念解析',
      ],
    ]),
    CHAPTER_REVIEW_TAB_NAME,
  );
  return workbook;
}

const fixes = { chapterMap: { '3': 'chapter-3', '4': 'chapter-4' } };

const snapshotOf = (
  questionRows: readonly (readonly string[])[],
  reviewRows: readonly (readonly string[])[] = [],
  extraFixes: Record<string, unknown> = {},
) =>
  buildSheetSnapshot({
    fixes: { ...fixes, ...extraFixes },
    workbook: makeWorkbook(questionRows, reviewRows),
  });

const dbQuestionOf = (
  code: string,
  overrides: Readonly<
    Partial<Record<'answer' | 'explanation' | 'prompt', string>>
  > = {},
  optionTexts: readonly string[] = ['明色', '中間色', '濁色', '暗色'],
) => ({
  code,
  explanation: overrides.explanation ?? `${code} 的解析。`,
  options: optionTexts.map((text, index) => ({
    correct: (overrides.answer ?? 'D') === 'ABCD'[index],
    key: 'ABCD'[index] ?? 'A',
    text,
  })),
  prompt: overrides.prompt ?? `${code} 的題目？`,
});

describe('fingerprint', () => {
  it('忽略全形半形空白與換行', () => {
    expect(fingerprint('色彩　三要素\n說明 文字')).toBe(
      fingerprint('色彩三要素說明文字'),
    );
    expect(fingerprint('甲')).not.toBe(fingerprint('乙'));
  });
});

describe('detectAnswerConflict 啟發式', () => {
  it('抓到 4-1-09 型矛盾：何者不正確型、解析卻稱正解選項正確', () => {
    expect(
      detectAnswerConflict({
        answer: 'C',
        explanation:
          '在反應速度上，視桿細胞的反應速度比視錐細胞慢，因此選項C的敘述「柱狀細胞的反應速度比錐狀細胞慢」是正確的，非不正確之選項。',
        prompt: '下列關於錐、柱狀細胞的敘述，何者不正確？',
      }),
    ).not.toBeNull();
  });

  it('一致的負向題解析不誤報', () => {
    expect(
      detectAnswerConflict({
        answer: 'C',
        explanation:
          '依教材說法，柱狀細胞反應並不慢，因此 C 的敘述不正確；A、B、D 均為正確描述。',
        prompt: '下列關於錐、柱狀細胞的敘述，何者不正確？',
      }),
    ).toBeNull();
  });

  it('負向題以「故選項 X 正確」表示作答結論時不誤判為敘述為真', () => {
    expect(
      detectAnswerConflict({
        answer: 'D',
        explanation:
          'ITTEN 為色彩教學體系，並未發行工業用油墨色票。故選項D正確。',
        prompt: '下列何者不是印刷用的油墨色票？',
      }),
    ).toBeNull();
  });

  it('解析明示不同答案時提示矛盾', () => {
    expect(
      detectAnswerConflict({
        answer: 'A',
        explanation: '綜合以上，答案為 B。',
        prompt: '下列何者正確？',
      }),
    ).not.toBeNull();
  });

  it('RGB 數值文字不觸發字母誤判', () => {
    expect(
      detectAnswerConflict({
        answer: 'D',
        explanation:
          'R255 G0 B255 是紅光加藍光，呈現洋紅色而非綠色，因此 D 的敘述不正確。',
        prompt: '有關色光RGB混色模式的敘述，下列何者不正確？',
      }),
    ).toBeNull();
  });
});

describe('buildSheetSnapshot 防呆', () => {
  it('QB 系統序號的小節必須與 Sheet 小節欄一致', () => {
    const mismatched = [
      'QB3201',
      '3',
      '章名',
      '1',
      '小節名',
      '題目？',
      '甲',
      '乙',
      '丙',
      '丁',
      'A',
      '解析。',
    ];

    expect(snapshotOf([mismatched]).errors.join()).toContain(
      '小節 2 與小節欄「1」不一致',
    );
  });

  it('題號重複一律為結構錯誤，不允許匯入器自動改號', () => {
    const rows = [
      question('3-1-01'),
      question('3-1-01', { prompt: '另一題？' }),
    ];
    expect(snapshotOf(rows).errors.join()).toContain('重複');
    const stillRejected = snapshotOf(rows, [], {
      duplicateRenames: { '3-1-01': '3-1-02' },
    });
    expect(stillRejected.errors.join()).toContain(
      '系統序號必須由 Google Sheet 修正',
    );
    expect(stillRejected.questions.map((entry) => entry.code)).toEqual([
      '3-1-01',
    ]);
  });

  it('缺正解 → 錯誤；列入 skipCodes → 略過', () => {
    const rows = [question('4-1-01', { answer: '' })];
    expect(snapshotOf(rows).errors.join()).toContain('缺正解');
    const skipped = snapshotOf(rows, [], {
      skipCodes: { '4-1-01': '待教師修表' },
    });
    expect(skipped.errors).toEqual([]);
    expect(skipped.skippedCodes).toEqual([
      { code: '4-1-01', reason: '待教師修表' },
    ]);
  });

  it('選項文字完全相同 → 結構錯誤', () => {
    const rows = [
      question('4-1-01', { answer: 'B' }, ['相同文字', '相同文字', '丙', '丁']),
    ];
    expect(snapshotOf(rows).errors.join()).toContain('文字完全相同');
  });

  it('題幹相同但選項組不同時視為兩道不同題目', () => {
    const samePrompt = '下列有關曼塞爾表色系的敘述，何者錯誤？';
    const snapshot = snapshotOf([
      question('3-2-38', { prompt: samePrompt }, [
        '應用敘述甲',
        '應用敘述乙',
        '應用敘述丙',
        '應用敘述丁',
      ]),
      question('3-2-39', { prompt: samePrompt }, [
        '規則敘述甲',
        '規則敘述乙',
        '規則敘述丙',
        '規則敘述丁',
      ]),
    ]);

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.questions).toHaveLength(2);
  });

  it('缺標題複習卡列入 cardSkipped，不進比對', () => {
    const snapshot = snapshotOf(
      [question('3-1-01')],
      [['3', '3-2 色彩體系', '結構', '', '缺標題的內容']],
    );
    expect(snapshot.reviewCards).toEqual([]);
    expect(snapshot.cardSkipped).toHaveLength(1);
    expect(snapshot.cardSkipped[0]?.reason).toContain('卡片標題');
  });
});

describe('compareSnapshots', () => {
  const sheet = snapshotOf(
    [question('3-1-01')],
    [['3', '3-1 色彩三要素', '分類', '有彩色', '卡片內容甲']],
  );
  const card = sheet.reviewCards[0];
  const matchingDb = (): DbSnapshot => ({
    questions: [dbQuestionOf('3-1-01')],
    reviewCards: [
      {
        content: '卡片 內容甲',
        groupLabel: '分類',
        stableCode: card?.stableCode ?? '',
        subtopicCode: 'sheet-3-1-all',
        title: '有彩色',
      },
    ],
  });

  it('內容一致（僅空白差異）→ 無差異', () => {
    const result = compareSnapshots({ db: matchingDb(), sheet });
    expect(result.diffs).toEqual([]);
    expect(result.matchedQuestions).toBe(1);
    expect(result.matchedCards).toBe(1);
  });

  it('解析不同 → 差異；列入 verifyKnownDivergences → 歸入已知', () => {
    const db: DbSnapshot = {
      ...matchingDb(),
      questions: [dbQuestionOf('3-1-01', { explanation: '庫內舊版解析。' })],
    };
    const plain = compareSnapshots({ db, sheet });
    expect(plain.diffs).toEqual([
      {
        code: '3-1-01',
        detail: undefined,
        field: '解析',
        kind: 'field_mismatch',
      },
    ]);
    const listed = compareSnapshots({
      db,
      knownDivergences: {
        '3-1-01': { fields: ['explanation'], reason: '待教師裁定' },
      },
      sheet,
    });
    expect(listed.diffs).toEqual([]);
    expect(listed.known).toHaveLength(1);
  });

  it('正解不同與單邊缺漏都會列出', () => {
    const db: DbSnapshot = {
      questions: [
        dbQuestionOf('3-1-01', { answer: 'A' }),
        dbQuestionOf('9-9-01'),
      ],
      reviewCards: [],
    };
    const result = compareSnapshots({ db, sheet });
    const kinds = result.diffs.map((diff) => `${diff.kind}:${diff.code}`);
    expect(result.diffs.find((diff) => diff.field === '正解')?.detail).toBe(
      '表 D vs 庫 A',
    );
    expect(kinds).toContain('missing_in_sheet:9-9-01');
    expect(kinds).toContain(`missing_in_db:${card?.stableCode ?? ''}`);
  });
});

describe('resolveExitCode', () => {
  const diff = { code: 'x', kind: 'field_mismatch' as const };
  it('結構錯誤一律 exit 1；內容差異只在 audit 擋', () => {
    expect(resolveExitCode({ diffs: [], errors: ['壞'], mode: 'gate' })).toBe(
      1,
    );
    expect(resolveExitCode({ diffs: [diff], errors: [], mode: 'audit' })).toBe(
      1,
    );
    expect(resolveExitCode({ diffs: [diff], errors: [], mode: 'gate' })).toBe(
      0,
    );
    expect(resolveExitCode({ diffs: [], errors: [], mode: 'audit' })).toBe(0);
  });
});
