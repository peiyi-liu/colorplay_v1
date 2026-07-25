-- 教師視角單一學生學習進度（Live design handoff D2）。
-- 原則：不建立第二套精熟度演算法——把 get_review_completion／
-- get_learning_progress 的計算抽成以 user 為參數的內部核心，
-- 既有學生端包裝函式改為委派，教師 RPC 重用同一核心。

-- 1) 內部核心：複習完成度（參數化 user）。僅供 definer 函式呼叫。
create function public.review_completion_for(
  p_user_id uuid,
  p_chapter_id uuid default null
)
returns table (
  subtopic_id uuid,
  chapter_id uuid,
  completed_count integer,
  total_count integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    st.id as subtopic_id,
    ch.id as chapter_id,
    count(card.id) filter (
      where exists (
        select 1
        from public.review_progress progress
        where progress.user_id = p_user_id
          and progress.review_card_id = card.id
          and (
            progress.card_version = card.version
            or card.requires_recompletion = false
          )
      )
    )::integer as completed_count,
    count(card.id)::integer as total_count
  from public.subtopics st
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  join public.courses c on c.id = ch.course_id
  left join public.review_cards card
    on card.subtopic_id = st.id and card.status = 'published'
  where st.status = 'published'
    and s.status = 'published'
    and ch.status = 'published'
    and c.status = 'published'
    and (p_chapter_id is null or ch.id = p_chapter_id)
    and p_user_id is not null
  group by st.id, ch.id, st.sort_order
  order by st.sort_order, st.id
$$;

revoke all on function public.review_completion_for(uuid, uuid)
from public, anon, authenticated;

-- 2) 內部核心：學習進度（參數化 user，額外回傳原始計數供加權平均）。
create function public.learning_progress_for(
  p_user_id uuid,
  p_chapter_id uuid default null
)
returns table (
  scope text,
  chapter_id uuid,
  subtopic_id uuid,
  review_completed integer,
  review_total integer,
  coverage numeric,
  accuracy numeric,
  mastery numeric,
  status text,
  rules_version text,
  question_total integer,
  question_answered integer,
  question_correct integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with current_questions as (
    select q.id, q.version, st.id as subtopic_id, ch.id as chapter_id
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where q.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
      and (p_chapter_id is null or ch.id = p_chapter_id)
  ),
  latest_answers as (
    select distinct on (cq.id)
      cq.id as question_id,
      cq.subtopic_id,
      cq.chapter_id,
      answer.answer_status
    from current_questions cq
    join public.quiz_session_questions sq
      on sq.question_id = cq.id and sq.question_version = cq.version
    join public.quiz_answers answer on answer.session_question_id = sq.id
    join public.quiz_sessions session on session.id = sq.session_id
    where session.user_id = p_user_id
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    order by cq.id, answer.answered_at desc
  ),
  subtopic_questions as (
    select
      cq.subtopic_id,
      cq.chapter_id,
      count(cq.id)::integer as total,
      count(la.question_id)::integer as answered,
      count(la.question_id) filter (
        where la.answer_status = 'correct'
      )::integer as correct
    from current_questions cq
    left join latest_answers la on la.question_id = cq.id
    group by cq.subtopic_id, cq.chapter_id
  ),
  review_counts as (
    select rc.subtopic_id, rc.chapter_id, rc.completed_count, rc.total_count
    from public.review_completion_for(p_user_id, p_chapter_id) rc
  ),
  subtopic_rows as (
    select
      'subtopic'::text as scope,
      rc.chapter_id,
      rc.subtopic_id,
      coalesce(rc.completed_count, 0) as review_completed,
      nullif(coalesce(rc.total_count, 0), 0) as review_total,
      coalesce(sq.total, 0) as total,
      coalesce(sq.answered, 0) as answered,
      coalesce(sq.correct, 0) as correct
    from review_counts rc
    left join subtopic_questions sq on sq.subtopic_id = rc.subtopic_id
  ),
  chapter_rows as (
    select
      'chapter'::text as scope,
      base.chapter_id,
      null::uuid as subtopic_id,
      sum(base.review_completed)::integer as review_completed,
      nullif(sum(coalesce(base.review_total, 0)), 0)::integer as review_total,
      sum(base.total)::integer as total,
      sum(base.answered)::integer as answered,
      sum(base.correct)::integer as correct
    from subtopic_rows base
    group by base.chapter_id
  ),
  combined as (
    select * from subtopic_rows
    union all
    select * from chapter_rows
  )
  select
    combined.scope,
    combined.chapter_id,
    combined.subtopic_id,
    combined.review_completed,
    combined.review_total,
    case when combined.total > 0
      then round(combined.answered * 100.0 / combined.total, 1)
      else null
    end as coverage,
    case when combined.answered > 0
      then round(combined.correct * 100.0 / combined.answered, 1)
      else null
    end as accuracy,
    case when combined.total > 0
      then round(combined.correct * 100.0 / combined.total, 1)
      else null
    end as mastery,
    case
      when combined.answered = 0 then 'not_started'
      when combined.correct * 100.0 / combined.total >= 80 then 'mastered'
      when combined.correct * 100.0 / combined.total >= 60 then 'developing'
      else 'learning'
    end as status,
    '2026-07-progress-1'::text as rules_version,
    combined.total as question_total,
    combined.answered as question_answered,
    combined.correct as question_correct
  from combined
  where p_user_id is not null
$$;

revoke all on function public.learning_progress_for(uuid, uuid)
from public, anon, authenticated;

-- 3) 既有學生端包裝函式改為委派（簽名與行為不變）。
create or replace function public.get_review_completion(
  p_chapter_id uuid default null
)
returns table (
  subtopic_id uuid,
  chapter_id uuid,
  completed_count integer,
  total_count integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select core.subtopic_id, core.chapter_id, core.completed_count, core.total_count
  from public.review_completion_for((select auth.uid()), p_chapter_id) core
$$;

create or replace function public.get_learning_progress(
  p_chapter_id uuid default null
)
returns table (
  scope text,
  chapter_id uuid,
  subtopic_id uuid,
  review_completed integer,
  review_total integer,
  coverage numeric,
  accuracy numeric,
  mastery numeric,
  status text,
  rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    core.scope,
    core.chapter_id,
    core.subtopic_id,
    core.review_completed,
    core.review_total,
    core.coverage,
    core.accuracy,
    core.mastery,
    core.status,
    core.rules_version
  from public.learning_progress_for((select auth.uid()), p_chapter_id) core
$$;

-- 4) 教師 RPC：單一學生進度快照。
create function public.teacher_student_progress(
  p_classroom_id uuid,
  p_member_ref uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  student_id uuid;
  student_status public.classroom_member_status;
  student_joined_at timestamptz;
  identity_payload jsonb;
  stats_payload jsonb;
  chapters_payload jsonb;
  mistakes_payload jsonb;
  class_rank integer;
  class_xp bigint;
  avg_accuracy numeric;
  open_mistakes integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  perform 1
  from public.classrooms as classroom
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = actor_id;

  if not found then
    raise exception using errcode = '42501', message = 'CLASSROOM_NOT_AVAILABLE';
  end if;

  select membership.user_id, membership.status, membership.joined_at
  into student_id, student_status, student_joined_at
  from public.classroom_members as membership
  where membership.classroom_id = p_classroom_id
    and membership.member_ref = p_member_ref
    and membership.member_role = 'student';

  if not found then
    raise exception using errcode = '42501', message = 'MEMBER_NOT_AVAILABLE';
  end if;

  select jsonb_build_object(
    'display_name', profile.display_name,
    'full_name', profile.full_name,
    'login_account', profile.login_account,
    'membership_status', student_status,
    'joined_at', student_joined_at
  )
  into identity_payload
  from public.profiles as profile
  where profile.id = student_id;

  -- 班級 XP 與名次：與 get_classroom_leaderboard 完全相同的規則
  -- （active 學生、入班後 XP、同分以先達成者優先）。停用成員無名次。
  with eligible_members as (
    select membership.user_id, membership.joined_at
    from public.classroom_members as membership
    where membership.classroom_id = p_classroom_id
      and membership.member_role = 'student'
      and membership.status = 'active'
  ),
  aggregated as (
    select
      member.user_id,
      coalesce(sum(transaction.amount), 0)::bigint as total_xp,
      case
        when count(transaction.id) = 0 then member.joined_at
        else max(transaction.created_at)
      end as first_reached_at
    from eligible_members as member
    left join public.xp_transactions as transaction
      on transaction.user_id = member.user_id
      and transaction.created_at >= member.joined_at
    group by member.user_id, member.joined_at
  ),
  ranked as (
    select
      aggregate.user_id,
      aggregate.total_xp,
      row_number() over (
        order by
          aggregate.total_xp desc,
          aggregate.first_reached_at asc,
          aggregate.user_id asc
      ) as rank
    from aggregated as aggregate
  )
  select ranked.rank, ranked.total_xp
  into class_rank, class_xp
  from ranked
  where ranked.user_id = student_id;

  if class_xp is null then
    select coalesce(sum(transaction.amount), 0)::bigint
    into class_xp
    from public.xp_transactions as transaction
    where transaction.user_id = student_id
      and transaction.created_at >= student_joined_at;
  end if;

  select
    case when sum(core.question_answered) > 0
      then round(
        sum(core.question_correct) * 100.0 / sum(core.question_answered), 1
      )
      else null
    end
  into avg_accuracy
  from public.learning_progress_for(student_id, null) core
  where core.scope = 'chapter';

  select count(*)::integer
  into open_mistakes
  from public.mistake_items as mistake
  where mistake.user_id = student_id
    and mistake.status in ('open', 'reopened');

  stats_payload := jsonb_build_object(
    'class_xp', class_xp,
    'class_rank', class_rank,
    'avg_accuracy', avg_accuracy,
    'open_mistake_count', open_mistakes
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'chapter_id', core.chapter_id,
        'chapter_title', chapter.title,
        'review_completed', core.review_completed,
        'review_total', core.review_total,
        'coverage', core.coverage,
        'accuracy', core.accuracy,
        'mastery', core.mastery,
        'status', core.status
      )
      order by chapter.sort_order, chapter.id
    ),
    '[]'::jsonb
  )
  into chapters_payload
  from public.learning_progress_for(student_id, null) core
  join public.chapters as chapter on chapter.id = core.chapter_id
  where core.scope = 'chapter';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'prompt', question.prompt,
        'subtopic_code', subtopic.stable_code,
        'subtopic_title', subtopic.title,
        'wrong_count', (
          select count(*)::integer
          from public.quiz_answers as answer
          join public.quiz_session_questions as sq
            on sq.id = answer.session_question_id
          join public.quiz_sessions as session
            on session.id = sq.session_id
          where session.user_id = student_id
            and sq.question_id = mistake.question_id
            and answer.answer_status in ('incorrect', 'timeout')
        )
      )
      order by mistake.last_event_at desc
    ),
    '[]'::jsonb
  )
  into mistakes_payload
  from public.mistake_items as mistake
  join public.questions as question on question.id = mistake.question_id
  join public.subtopics as subtopic on subtopic.id = question.subtopic_id
  where mistake.user_id = student_id
    and mistake.status in ('open', 'reopened');

  return jsonb_build_object(
    'identity', identity_payload,
    'stats', stats_payload,
    'chapters', chapters_payload,
    'mistakes', mistakes_payload
  );
end;
$$;

revoke all on function public.teacher_student_progress(uuid, uuid)
from public, anon;

grant execute on function public.teacher_student_progress(uuid, uuid)
to authenticated;
