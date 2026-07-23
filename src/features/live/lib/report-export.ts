import type { LiveSessionDetail } from '../types';

/** owner 裁定：正確率低於 35% 的題目標記「建議重教」並置頂。 */
export const RETEACH_THRESHOLD = 35;

export const reteachQuestions = (
  questions: LiveSessionDetail['questions'],
): LiveSessionDetail['questions'] =>
  questions.filter(
    (question) =>
      question.correctRate !== null && question.correctRate < RETEACH_THRESHOLD,
  );

const STATUS_LABELS = {
  correct: '對',
  incorrect: '錯',
  timeout: '逾時',
} as const;

export const matrixCellLabel = (
  answer:
    | Readonly<{
        status: keyof typeof STATUS_LABELS;
        responseMs: number | null;
      }>
    | undefined,
): string => {
  if (!answer) return '—';
  const base = STATUS_LABELS[answer.status];
  return answer.responseMs === null
    ? base
    : `${base}（${String(answer.responseMs)} ms）`;
};

const csvField = (value: string): string =>
  /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/**
 * 個人×題目矩陣 CSV，由報表 payload 於前端產出（免新後端）。
 * 前置 BOM 讓 Excel 以 UTF-8 開啟繁中不亂碼。
 */
export const buildMatrixCsv = (detail: LiveSessionDetail): string => {
  const header = [
    '學生',
    '名次',
    '總分',
    ...detail.questions.map((question) => `第${String(question.position)}題`),
  ];
  const rows = detail.participants.map((participant) => {
    const byPosition = new Map(
      participant.answers.map((answer) => [answer.position, answer]),
    );
    return [
      participant.displayName,
      participant.rank === null ? '—' : String(participant.rank),
      String(participant.score),
      ...detail.questions.map((question) =>
        matrixCellLabel(byPosition.get(question.position)),
      ),
    ];
  });
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvField).join(','))
    .join('\n')}\n`;
};
