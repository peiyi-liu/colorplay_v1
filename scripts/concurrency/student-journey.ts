import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { fail, safely, type FunctionalScope } from './config';
import type { FunctionalIdentity } from './owned-fixtures';
import type { PrivateJournal } from './private-journal';
import {
  createBusinessDiagnostics,
  type BusinessHealthPort,
} from './business-diagnostics';
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
  signal?: AbortSignal,
  health?: BusinessHealthPort,
) =>
  safely(async () => {
    if (!['S1', 'S2'].includes(identity.label) || !identity.userId)
      return fail('FUNCTIONAL_STUDENT_FAILED');
    const localJournal: PrivateJournal = {
      directory: journal.directory,
      write: (name, value) =>
        journal.write(`${identity.label.toLowerCase()}-${name}`, value),
    };
    const userId = identity.userId;
    const diagnostic = createBusinessDiagnostics(
      localJournal,
      signal,
      undefined,
      health,
    );
    const chapter = await diagnostic.step('chapter', () =>
      functionalChapter(client),
    );
    const review = await diagnostic.step('review', () =>
      reviewFunctionalCards(page, client),
    );
    const quiz = await diagnostic.step('formal_quiz', () =>
      formalFunctionalQuiz(
        page,
        client,
        scope,
        chapter.templateId,
        identity.label === 'S2' ? 2 : 0,
        localJournal,
        `formal-${identity.label.toLowerCase()}`,
      ),
    );
    const remediation =
      identity.label === 'S2'
        ? await diagnostic.step('remediation', () =>
            remediationFunctional(page, client, scope, localJournal),
          )
        : null;
    const mastery =
      identity.label === 'S1'
        ? await diagnostic.step('mastery', () =>
            masteryFunctional(page, client, localJournal),
          )
        : null;
    const purchase =
      identity.label === 'S1'
        ? await diagnostic.step('purchase', () =>
            purchaseEquipFunctional(page, client, scope),
          )
        : null;
    const achievements = await diagnostic.step('achievements', () =>
      achievementLeaderboardFunctional(page, client, classroomId),
    );
    const ledger = await diagnostic.step('ledger', () =>
      studentLedgerReadback(client, userId),
    );
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
