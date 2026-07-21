-- 我的錯題（owner 2026-07-21 #13）：清單改為含正確答案的事後複習視圖。
-- 揭示邊界與 quiz-result 相同——只揭示「本人已作答錯誤」題目的正解；
-- 未作答題目的正解仍不出現在任何學生可及的路徑。

create function public.list_my_mistakes()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mistake_id', mistake.id,
        'status', mistake.status,
        'last_event_at', mistake.last_event_at,
        'prompt', question.prompt,
        'stable_code', question.stable_code,
        'subtopic_id', subtopic.id,
        'subtopic_title', subtopic.title,
        'correct_option_text', correct_option.option_text
      )
      order by mistake.last_event_at desc
    ),
    '[]'::jsonb
  )
  from public.mistake_items as mistake
  join public.questions as question on question.id = mistake.question_id
  join public.subtopics as subtopic on subtopic.id = question.subtopic_id
  join public.question_options as correct_option
    on correct_option.question_id = question.id
    and correct_option.is_correct
  where mistake.user_id = auth.uid();
$$;

revoke all on function public.list_my_mistakes() from public, anon, authenticated;
grant execute on function public.list_my_mistakes() to authenticated;
