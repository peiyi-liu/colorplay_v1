begin;

select plan(4);

select has_index(
  'public',
  'quiz_session_questions',
  'quiz_session_questions_question_version_idx',
  'learning progress can locate frozen question versions without scanning every session question'
);

select matches(
  pg_get_functiondef(
    'public.get_learning_progress(uuid)'::regprocedure
  ),
  'learning_progress_for',
  'student learning progress delegates to the shared progress snapshot'
);

select matches(
  pg_get_functiondef(
    'public.get_student_chapter_map()'::regprocedure
  ),
  'learning_progress_for',
  'chapter map obtains all chapter progress from one shared snapshot'
);

select ok(
  position(
    'student_chapter_completion' in pg_get_functiondef(
      'public.get_student_chapter_map()'::regprocedure
    )
  ) = 0,
  'chapter map does not recalculate progress once per chapter'
);

select * from finish();
rollback;
