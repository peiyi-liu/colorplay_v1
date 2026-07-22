import { describe, expect, it } from 'vitest';

import type { LiveSessionDetail } from '../types';
import {
  buildMatrixCsv,
  matrixCellLabel,
  reteachQuestions,
} from './report-export';

const detail: LiveSessionDetail = {
  sessionId: '18400000-0000-0000-0000-000000000001',
  mode: 'individual',
  completedAt: '2026-07-22T05:00:00+00:00',
  classroomId: '18100000-0000-0000-0000-000000000001',
  activity: {
    title: '色彩快問快答',
    quizTemplateId: '26000000-0000-0000-0000-000000000003',
  },
  questions: [
    {
      position: 1,
      prompt: '色彩三要素是？',
      answered: 2,
      correct: 2,
      correctRate: 100.0,
      averageResponseMs: 900,
    },
    {
      position: 2,
      prompt: '含逗號, 的題目',
      answered: 2,
      correct: 0,
      correctRate: 0.0,
      averageResponseMs: null,
    },
  ],
  participants: [
    {
      displayName: '甲同學',
      rank: 1,
      score: 300,
      teamNumber: null,
      answers: [
        { position: 1, status: 'correct', responseMs: 900 },
        { position: 2, status: 'timeout', responseMs: null },
      ],
    },
    {
      displayName: '乙同學',
      rank: 2,
      score: 150,
      teamNumber: null,
      answers: [{ position: 1, status: 'correct', responseMs: 1200 }],
    },
  ],
  ranking: [],
};

describe('report export helpers', () => {
  it('flags only sub-35% questions for reteaching', () => {
    const flagged = reteachQuestions(detail.questions);
    expect(flagged.map((question) => question.position)).toEqual([2]);
    const [first] = detail.questions;
    if (!first) throw new Error('fixture must have questions');
    expect(reteachQuestions([{ ...first, correctRate: null }])).toEqual([]);
  });

  it('labels matrix cells with status and timing', () => {
    expect(matrixCellLabel({ status: 'correct', responseMs: 900 })).toBe(
      '對（900 ms）',
    );
    expect(matrixCellLabel({ status: 'timeout', responseMs: null })).toBe(
      '逾時',
    );
    expect(matrixCellLabel(undefined)).toBe('—');
  });

  it('builds a BOM-prefixed CSV with one row per participant', () => {
    const csv = buildMatrixCsv(detail);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('學生,名次,總分,第1題,第2題');
    expect(lines[1]).toBe('甲同學,1,300,對（900 ms）,逾時');
    // 未作答（遲到）以破折號補位。
    expect(lines[2]).toBe('乙同學,2,150,對（1200 ms）,—');
  });
});
