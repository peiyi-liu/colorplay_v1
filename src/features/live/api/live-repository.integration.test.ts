import { afterAll, describe, expect, it } from 'vitest';

import { GENERATED_CORRECT_ANSWERS } from '../../../../tests/fixtures/question-answers.generated';
import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createClassroomRepository } from '../../classrooms/api/classroom-repository';
import { LiveRepositoryError } from '../types';
import { createLiveRepository } from './live-repository';

const QUIZ_TEMPLATE_ID = '26000000-0000-0000-0000-000000000003';

describe('LiveRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('runs a full authoritative match through the trusted commands', async () => {
    const hostClient = await signedInClient(TEST_USERS.liveHostTeacher);
    const studentAClient = await signedInClient(TEST_USERS.liveStudentOne);
    const studentBClient = await signedInClient(TEST_USERS.liveStudentTwo);
    const outsiderClient = await signedInClient(TEST_USERS.outsider);
    clients.push(hostClient, studentAClient, studentBClient, outsiderClient);
    const host = createLiveRepository(hostClient);
    const studentA = createLiveRepository(studentAClient);
    const studentB = createLiveRepository(studentBClient);
    const outsider = createLiveRepository(outsiderClient);

    const classroomName = `Live ${crypto.randomUUID()}`.slice(0, 80);
    const classroom = await createClassroomRepository(
      hostClient,
    ).createClassroom({ name: classroomName });
    for (const studentClient of [studentAClient, studentBClient]) {
      await createClassroomRepository(studentClient).joinClassroom({
        joinCode: classroom.joinCode,
        requestId: crypto.randomUUID(),
      });
    }

    // Device mode keeps prompts on the student payload; this flow answers by
    // matching the generated prompt text (screen_only is covered by pgTAP 042).
    const activity = await host.createActivity({
      title: `Live 對戰 ${classroomName.slice(-8)}`,
      quizTemplateId: QUIZ_TEMPLATE_ID,
      questionTimeLimitSeconds: 20,
      questionDisplay: 'device',
    });
    const session = await host.createSession({
      activityId: activity.activityId,
      classroomId: classroom.classroomId,
      assignmentId: null,
    });
    await host.startSession(session.sessionId, session.stateVersion);

    const joinRequest = crypto.randomUUID();
    const joined = await studentA.join({
      joinCode: session.joinCode,
      requestId: joinRequest,
    });
    const replayed = await studentA.join({
      joinCode: session.joinCode,
      requestId: joinRequest,
    });
    expect(replayed).toEqual(joined);
    await studentB.join({
      joinCode: session.joinCode,
      requestId: crypto.randomUUID(),
    });
    await expect(
      outsider.join({
        joinCode: session.joinCode,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toEqual(new LiveRepositoryError('JOIN_INVALID_CODE'));

    let hostState = await host.getState(session.sessionId);
    expect(hostState).toMatchObject({
      state: 'lobby',
      participantCount: 2,
      isHost: true,
    });

    for (let round = 1; round <= hostState.questionCount; round += 1) {
      if (round === 1) {
        await host.openQuestion(session.sessionId, hostState.stateVersion);
      } else {
        await host.advance(session.sessionId, hostState.stateVersion);
      }

      const playerView = await studentA.getState(session.sessionId);
      expect(playerView.state).toBe('question_open');
      expect(playerView.correctOptionId).toBeUndefined();
      const question = playerView.question;
      if (!question?.prompt) throw new Error('LIVE_TEST_QUESTION_MISSING');
      const correctText = GENERATED_CORRECT_ANSWERS.get(question.prompt);
      const correctOption = question.publicOptions.find(
        (option) => option.text === correctText,
      );
      if (!correctOption) throw new Error('LIVE_TEST_ANSWER_MISSING');
      await studentA.submitAnswer({
        sessionQuestionId: question.questionId,
        selectedOptionId: correctOption.id,
        idempotencyKey: crypto.randomUUID(),
      });

      hostState = await host.getState(session.sessionId);
      await host.closeQuestion(session.sessionId, hostState.stateVersion);
      hostState = await host.getState(session.sessionId);
    }

    await host.finalize(session.sessionId, hostState.stateVersion);

    const finalA = await studentA.getState(session.sessionId);
    expect(finalA.state).toBe('completed');
    expect(finalA.myResult).toEqual({ score: 1500, rank: 1 });
    const finalB = await studentB.getState(session.sessionId);
    expect(finalB.myResult).toEqual({ score: 0, rank: 2 });
    expect(finalA.podium?.[0]).toMatchObject({ rank: 1, score: 1500 });
  });
});
