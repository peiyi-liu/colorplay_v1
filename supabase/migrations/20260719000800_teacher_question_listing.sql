-- The questions table hides explanation and question_options.is_correct from
-- api roles through column grants (students must never read answers), so the
-- teacher workspace lists questions through a teacher-only trusted read.

create function public.teacher_list_questions()
returns table (
  question_id uuid,
  stable_code text,
  prompt text,
  explanation text,
  status public.content_status,
  version integer,
  subtopic_id uuid,
  options jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_content_teacher();
  return query
  select
    question.id,
    question.stable_code,
    question.prompt,
    question.explanation,
    question.status,
    question.version,
    question.subtopic_id,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'key', option.option_key,
            'text', option.option_text,
            'is_correct', option.is_correct
          )
          order by option.sort_order
        )
        from public.question_options option
        where option.question_id = question.id
      ),
      '[]'::jsonb
    )
  from public.questions question
  order by question.stable_code;
end;
$$;

revoke all on function public.teacher_list_questions() from public, anon;
grant execute on function public.teacher_list_questions() to authenticated;
