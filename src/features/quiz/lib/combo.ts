import type { QuizQuestion } from '../api/quiz-repository';

/** 連續答對計數:從頭累積,答錯/逾時歸零,遇未作答題即停(純表現層派生,不觸計分) */
export const comboCount = (questions: readonly QuizQuestion[]): number => {
  let count = 0;
  for (const question of questions) {
    if (question.answerStatus === null) break;
    count = question.answerStatus === 'correct' ? count + 1 : 0;
  }
  return count;
};
