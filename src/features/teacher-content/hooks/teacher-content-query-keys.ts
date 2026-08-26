import type {
  AnswerAssessmentSource,
  AnalyticsFilters,
  AssessmentSource,
  DateRangeFilters,
} from '../api/teacher-content-repository';

export const teacherContentKeys = {
  assessmentQuestions: (
    actorId: string,
    classroomId: string,
    filters: AnalyticsFilters,
    source: AssessmentSource,
  ) =>
    [
      'teacher-content',
      actorId,
      'assessment-questions',
      classroomId,
      filters,
      source,
    ] as const,
  assignmentSummary: (
    actorId: string,
    classroomId: string,
    filters: DateRangeFilters,
  ) =>
    [
      'teacher-content',
      actorId,
      'assignment-summary',
      classroomId,
      filters,
    ] as const,
  cards: ['teacher-content', 'cards'] as const,
  chapterCompletion: (
    actorId: string,
    classroomId: string,
    chapterId?: string | null,
  ) =>
    [
      'teacher-content',
      actorId,
      'chapter-completion',
      classroomId,
      chapterId,
    ] as const,
  classroomSummary: (
    actorId: string,
    classroomId: string,
    filters: AnalyticsFilters,
  ) =>
    [
      'teacher-content',
      actorId,
      'classroom-summary',
      classroomId,
      filters,
    ] as const,
  classroomOverview: (
    actorId: string,
    classroomId: string,
    filters: AnalyticsFilters,
  ) =>
    [
      'teacher-content',
      actorId,
      'classroom-overview',
      classroomId,
      filters,
    ] as const,
  liveHistory: (
    actorId: string,
    classroomId: string,
    filters: DateRangeFilters,
    page: number,
  ) =>
    [
      'teacher-content',
      actorId,
      'live-history',
      classroomId,
      filters,
      page,
    ] as const,
  liveReport: (
    actorId: string,
    classroomId: string,
    filters: DateRangeFilters,
  ) =>
    ['teacher-content', actorId, 'live-report', classroomId, filters] as const,
  questionAnalysis: (
    actorId: string,
    classroomId: string,
    filters: AnalyticsFilters,
  ) =>
    [
      'teacher-content',
      actorId,
      'question-analysis',
      classroomId,
      filters,
    ] as const,
  questionDetail: (actorId: string, classroomId: string, stableCode: string) =>
    [
      'teacher-content',
      actorId,
      'question-detail',
      classroomId,
      stableCode,
    ] as const,
  questionAnswer: (
    actorId: string,
    classroomId: string,
    stableCode: string,
    source: AnswerAssessmentSource,
    liveSessionId?: string | null,
  ) =>
    [
      'teacher-content',
      actorId,
      'question-answer',
      classroomId,
      stableCode,
      source,
      liveSessionId ?? null,
    ] as const,
  questions: ['teacher-content', 'questions'] as const,
  subtopicMastery: (
    actorId: string,
    classroomId: string,
    filters: AnalyticsFilters,
  ) =>
    [
      'teacher-content',
      actorId,
      'subtopic-mastery',
      classroomId,
      filters,
    ] as const,
  subtopics: ['teacher-content', 'subtopics'] as const,
};
