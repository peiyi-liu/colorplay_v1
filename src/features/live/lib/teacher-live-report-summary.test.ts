import { describe, expect, it } from 'vitest';

import type { LiveSessionDetail } from '../types';
import { deriveTeacherLiveReportSummary } from './teacher-live-report-summary';

const report = {
  participants: [{ displayName: '學生一' }, { displayName: '學生二' }],
  questions: [
    { answered: 4, correct: 3, correctRate: 75, position: 1, prompt: '題一' },
    { answered: 2, correct: 0, correctRate: 0, position: 2, prompt: '題二' },
    { answered: 0, correct: 0, correctRate: null, position: 3, prompt: '題三' },
  ],
  ranking: [
    { displayName: '第一名', rank: 1, score: 300 },
    { displayName: '第二名', rank: 2, score: 200 },
    { displayName: '第三名', rank: 3, score: 100 },
    { displayName: '第四名', rank: 4, score: 50 },
  ],
} as unknown as LiveSessionDetail;

describe('deriveTeacherLiveReportSummary', () => {
  it('uses only the approved participant, answer and ranking contracts', () => {
    expect(deriveTeacherLiveReportSummary(report)).toEqual({
      hardestQuestion: report.questions[1],
      overallAccuracy: 50,
      participantCount: 2,
      topThree: report.ranking.slice(0, 3),
    });
  });

  it('omits accuracy and hardest question when their denominators are absent', () => {
    expect(
      deriveTeacherLiveReportSummary({
        ...report,
        questions: report.questions.map((question) => ({
          ...question,
          answered: 0,
          correct: 0,
          correctRate: null,
        })),
      }),
    ).toMatchObject({ hardestQuestion: null, overallAccuracy: null });
  });

  it('preserves report order for hardest-question ties and authoritative ranks', () => {
    const first = report.ranking[0];
    const third = report.ranking[2];
    if (!first || !third) throw new Error('missing ranking fixtures');
    const summary = deriveTeacherLiveReportSummary({
      ...report,
      questions: report.questions.map((question, index) => ({
        ...question,
        correctRate: index < 2 ? 25 : null,
      })),
      ranking: [third, first],
    });
    expect(summary.hardestQuestion?.position).toBe(1);
    expect(summary.topThree.map((entry) => entry.rank)).toEqual([1, 3]);
  });
});
