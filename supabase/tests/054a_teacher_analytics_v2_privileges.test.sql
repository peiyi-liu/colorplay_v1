begin;

select plan(7);

select ok(
  has_function_privilege(
    'authenticated',
    'public.teacher_assessment_question_analysis(uuid, text, date, date, uuid)',
    'EXECUTE'
  ),
  'authenticated teachers may read unified assessment analysis'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.teacher_assessment_question_analysis(uuid, text, date, date, uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot read unified assessment analysis'
);

set local role anon;
select throws_ok(
  $$select * from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000001', 'all', null, null, null
    )$$,
  '42501', null, 'anonymous cannot execute assessment question analysis'
);
select throws_ok(
  $$select * from public.teacher_classroom_overview(
      '2a800000-0000-0000-0000-000000000001', null, null, null
    )$$,
  '42501', null, 'anonymous cannot execute classroom overview'
);
select throws_ok(
  $$select * from public.teacher_live_session_report_v2(
      '2a800000-0000-0000-0000-000000000001', null, null, 5, 0
    )$$,
  '42501', null, 'anonymous cannot execute Live history projection'
);
select throws_ok(
  $$select public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000002'
    )$$,
  '42501', null, 'anonymous cannot execute student progress projection'
);
select throws_ok(
  $$select * from public.teacher_assessment_facts(
      '2a800000-0000-0000-0000-000000000001', 'all', null, null, null
    )$$,
  '42501', null, 'anonymous cannot execute internal assessment facts'
);
reset role;

select * from finish();
rollback;
