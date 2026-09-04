import type { LiveSessionDetail } from '../types';

export type TeacherLiveReportSummary = Readonly<{
  hardestQuestion: LiveSessionDetail['questions'][number] | null;
  overallAccuracy: number | null;
  participantCount: number;
  topThree: readonly LiveSessionDetail['ranking'][number][];
}>;

export function deriveTeacherLiveReportSummary(
  report: LiveSessionDetail,
): TeacherLiveReportSummary {
  const answerTotals = report.questions.reduce(
    (total, question) => ({
      answered: total.answered + question.answered,
      correct: total.correct + question.correct,
    }),
    { answered: 0, correct: 0 },
  );
  const hardestQuestion = report.questions.reduce<
    LiveSessionDetail['questions'][number] | null
  >((hardest, question) => {
    if (question.correctRate === null) return hardest;
    if (hardest?.correctRate === null || hardest === null) return question;
    return question.correctRate < hardest.correctRate ? question : hardest;
  }, null);

  return {
    hardestQuestion,
    overallAccuracy:
      answerTotals.answered === 0
        ? null
        : (answerTotals.correct / answerTotals.answered) * 100,
    participantCount: report.participants.length,
    topThree: [...report.ranking]
      .filter((entry) => entry.rank >= 1 && entry.rank <= 3)
      .sort((left, right) => left.rank - right.rank),
  };
}
