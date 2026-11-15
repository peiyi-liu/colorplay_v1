import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { fail, safely, type FunctionalScope } from './config';
import type { FunctionalIdentity } from './owned-fixtures';
import type { PrivateJournal } from './private-journal';
import { formalFunctionalQuiz } from './student-quiz';
import {
  functionalChapter,
  masteryFunctional,
  remediationFunctional,
  reviewFunctionalCards,
} from './student-learning';
import {
  achievementLeaderboardFunctional,
  purchaseEquipFunctional,
  studentLedgerReadback,
} from './student-economy';

// B1 is a callable real journey, not a runnable placeholder. B3 owns aggregate
// sequencing / public receipt projection / 25-minute stop budget.
export const runFunctionalStudent = async (
  page: Page,
  client: SupabaseClient<Database>,
  identity: FunctionalIdentity,
  scope: FunctionalScope,
  journal: PrivateJournal,
  classroomId: string,
) =>
  safely(async () => {
    if (!['S1', 'S2'].includes(identity.label) || !identity.userId)
      return fail('FUNCTIONAL_STUDENT_FAILED');
    const localJournal: PrivateJournal = {
      directory: journal.directory,
      write: (name, value) =>
        journal.write(`${identity.label.toLowerCase()}-${name}`, value),
    };
    const chapter = await functionalChapter(client);
    const review = await reviewFunctionalCards(page, client);
    const quiz = await formalFunctionalQuiz(
      page,
      client,
      scope,
      chapter.templateId,
      identity.label === 'S2' ? 2 : 0,
      localJournal,
      `formal-${identity.label.toLowerCase()}`,
    );
    const remediation =
      identity.label === 'S2'
        ? await remediationFunctional(page, client, scope, localJournal)
        : null;
    const mastery =
      identity.label === 'S1'
        ? await masteryFunctional(page, client, localJournal)
        : null;
    const purchase =
      identity.label === 'S1'
        ? await purchaseEquipFunctional(page, client, scope)
        : null;
    const achievements = await achievementLeaderboardFunctional(
      page,
      client,
      classroomId,
    );
    const ledger = await studentLedgerReadback(client, identity.userId);
    return {
      review,
      quiz: {
        answered: quiz.answeredCount,
        correct: quiz.correctCount,
        xp: quiz.xpAwarded,
        tokens: quiz.tokensAwarded,
      },
      remediation,
      mastery,
      purchase,
      achievements,
      ledger,
    };
  }, 'FUNCTIONAL_STUDENT_FAILED');
