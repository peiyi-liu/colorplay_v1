import { afterAll, describe, expect, it } from 'vitest';

import { GENERATED_CORRECT_ANSWERS } from '../../../../tests/fixtures/question-answers.generated';
import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createClassroomRepository } from '../../classrooms/api/classroom-repository';
import { createQuizRepository } from '../../quiz/api/quiz-repository';
import { AssignmentRepositoryError } from '../types';
import { createAssignmentRepository } from './assignment-repository';

const QUIZ_TEMPLATE_ID = '26000000-0000-0000-0000-000000000003';

describe('AssignmentRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('runs the owner and target lifecycle against real trusted commands', async () => {
    const teacherClient = await signedInClient(TEST_USERS.assignmentTeacher);
    const studentClient = await signedInClient(TEST_USERS.assignmentStudentOne);
    const nonTargetClient = await signedInClient(
      TEST_USERS.assignmentStudentTwo,
    );
    clients.push(teacherClient, studentClient, nonTargetClient);
    const teacherAssignments = createAssignmentRepository(teacherClient);
    const studentAssignments = createAssignmentRepository(studentClient);
    const nonTargetAssignments = createAssignmentRepository(nonTargetClient);

    const classroomName = `Assignment ${crypto.randomUUID()}`.slice(0, 80);
    const classroom = await createClassroomRepository(
      teacherClient,
    ).createClassroom({ name: classroomName });
    await createClassroomRepository(studentClient).joinClassroom({
      joinCode: classroom.joinCode,
      requestId: crypto.randomUUID(),
    });

    const created = await teacherAssignments.createAssignment({
      classroomId: classroom.classroomId,
      title: `整合測試作業 ${classroomName.slice(-8)}`,
      quizTemplateId: QUIZ_TEMPLATE_ID,
      availableFrom: null,
      deadlineAt: null,
      attemptLimit: 2,
      passingThreshold: 600,
    });
    expect(created.status).toBe('draft');

    const published = await teacherAssignments.updateStatus({
      assignmentId: created.assignmentId,
      status: 'published',
      expectedUpdatedAt: created.updatedAt,
    });
    expect(published.status).toBe('published');

    const mine = await studentAssignments.listMine();
    const assignment = mine.find(
      (entry) => entry.assignmentId === created.assignmentId,
    );
    expect(assignment).toBeDefined();
    expect(assignment?.attemptsUsed).toBe(0);

    const requestId = crypto.randomUUID();
    const attempt = await studentAssignments.startAttempt({
      assignmentId: created.assignmentId,
      requestId,
    });
    const replayed = await studentAssignments.startAttempt({
      assignmentId: created.assignmentId,
      requestId,
    });
    expect(replayed).toEqual(attempt);
    expect(attempt.attemptNumber).toBe(1);

    const quiz = createQuizRepository(studentClient);
    let session = await quiz.getSession(attempt.sessionId);
    for (let position = 0; position < session.questionCount; position += 1) {
      const question = session.questions[position];
      if (!question) throw new Error('ASSIGNMENT_TEST_QUESTION_MISSING');
      const correctText = GENERATED_CORRECT_ANSWERS.get(question.prompt);
      const correctOption = question.options.find(
        (option) => option.text === correctText,
      );
      if (!correctOption) throw new Error('ASSIGNMENT_TEST_ANSWER_MISSING');
      await quiz.submitAnswer(
        question.sessionQuestionId,
        correctOption.id,
        crypto.randomUUID(),
      );
      if (position + 1 < session.questionCount) {
        session = await quiz.activateNextQuestion(session.sessionId);
      }
    }
    const finalized = await studentClient.rpc('finalize_quiz_session', {
      session_id: attempt.sessionId,
    });
    expect(finalized.error).toBeNull();
    const attemptPayload = (
      finalized.data as {
        assignment_attempt: { status: string; passed: boolean };
      }
    ).assignment_attempt;
    expect(attemptPayload.status).toBe('completed');
    expect(attemptPayload.passed).toBe(true);

    const afterCompletion = await studentAssignments.listMine();
    expect(
      afterCompletion.find(
        (entry) => entry.assignmentId === created.assignmentId,
      ),
    ).toMatchObject({
      attemptsUsed: 1,
      latestAttemptStatus: 'completed',
      latestPassed: true,
    });

    const ownerView = await teacherAssignments.listClassroom(
      classroom.classroomId,
    );
    expect(
      ownerView.find((entry) => entry.assignmentId === created.assignmentId),
    ).toMatchObject({ completedCount: 1, targetCount: 1 });

    const foreign = await nonTargetAssignments.listMine();
    expect(
      foreign.find((entry) => entry.assignmentId === created.assignmentId),
    ).toBeUndefined();
    await expect(
      nonTargetAssignments.startAttempt({
        assignmentId: created.assignmentId,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toEqual(new AssignmentRepositoryError('NOT_FOUND'));
  });
});
