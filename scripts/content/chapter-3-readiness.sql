with chapter as (
  select id from public.chapters
  where stable_code = 'chapter-3' and status = 'published'
), sections as (
  select id from public.sections
  where chapter_id = (select id from chapter)
    and status = 'published'
    and stable_code in ('sheet-3-1', 'sheet-3-2', 'sheet-3-3')
), subtopics as (
  select id from public.subtopics
  where section_id in (select id from sections) and status = 'published'
), banks as (
  select id, kind from public.assessment_banks
  where status = 'published'
    and (
      chapter_id = (select id from chapter)
      or section_id in (select id from sections)
    )
), bank_counts as (
  select kind, count(*)::integer as count from banks group by kind
), question_counts as (
  select bank.kind, count(*)::integer as count
  from public.questions question
  join banks bank on bank.id = question.bank_id
  where question.status = 'published'
  group by bank.kind
), routing_violations as (
  select count(*)::integer as count
  from public.assessment_banks bank
  where bank.id in (select id from banks)
    and (
      (bank.kind in ('QB', 'LT') and (
        bank.section_id is null or bank.chapter_id is not null
      ))
      or (bank.kind = 'CR' and (
        bank.chapter_id is null or bank.section_id is not null
      ))
    )
), option_violations as (
  select count(*)::integer as count
  from (
    select question.id
    from public.questions question
    left join public.question_options option on option.question_id = question.id
    where question.bank_id in (select id from banks)
      and question.status = 'published'
    group by question.id
    having count(option.id) not between 2 and 4
      or count(option.id) filter (where option.is_correct) <> 1
  ) invalid
), duplicate_codes as (
  select count(*)::integer as count from (
    select stable_code from public.review_cards
    where subtopic_id in (select id from subtopics)
    group by stable_code having count(*) > 1
    union all
    select stable_code from public.assessment_banks
    where id in (select id from banks)
    group by stable_code having count(*) > 1
    union all
    select stable_code from public.questions
    where bank_id in (select id from banks)
    group by stable_code having count(*) > 1
  ) duplicates
), facts as (
  select
    (select count(*)::integer from public.review_progress progress
      join public.review_cards card on card.id = progress.review_card_id
      where card.subtopic_id in (select id from subtopics)) as review_progress,
    (select count(*)::integer from public.quiz_answers answer
      join public.quiz_session_questions session_question
        on session_question.id = answer.session_question_id
      join public.questions question on question.id = session_question.question_id
      where question.bank_id in (select id from banks)) as quiz_attempts
)
select jsonb_build_object(
  'chapter', 'chapter-3',
  'migration_head', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'published_counts', jsonb_build_object(
    'Course', (select count(*) from public.courses
      where stable_code = 'color-theory' and status = 'published'),
    'Chapter', (select count(*) from chapter),
    'Section', (select count(*) from sections),
    'Subtopic', (select count(*) from subtopics),
    'RC', (select count(*) from public.review_cards
      where subtopic_id in (select id from subtopics) and status = 'published'),
    'QB', coalesce((select count from bank_counts where kind = 'QB'), 0),
    'CR', coalesce((select count from bank_counts where kind = 'CR'), 0),
    'LT', coalesce((select count from bank_counts where kind = 'LT'), 0),
    'QBQuestion', coalesce((select count from question_counts where kind = 'QB'), 0),
    'CRQuestion', coalesce((select count from question_counts where kind = 'CR'), 0),
    'LTQuestion', coalesce((select count from question_counts where kind = 'LT'), 0)
  ),
  'draft_counts', jsonb_build_object(
    'persistent', (select count(*) from public.content_drafts),
    'legacy_current_rows', (select count(*) from public.review_cards
      where subtopic_id in (select id from subtopics) and status = 'draft')
  ),
  'integrity', jsonb_build_object(
    'duplicate_stable_codes', (select count from duplicate_codes),
    'option_violations', (select count from option_violations),
    'routing_violations', (select count from routing_violations)
  ),
  'history', jsonb_build_object(
    'publication_events', (select count(*) from public.content_publication_events),
    'quiz_attempt_facts', (select quiz_attempts from facts),
    'review_progress_facts', (select review_progress from facts)
  ),
  'media', jsonb_build_object(
    'current_manifest_mappings', (
      select count(*) from public.review_card_media media
      join public.review_cards card on card.id = media.review_card_id
      where card.subtopic_id in (select id from subtopics)
        and card.status = 'published' and media.card_version = card.version
        and media.manifest_id is not null
    ),
    'verified_assets', (select count(*) from public.content_media_assets
      where verified_at is not null)
  )
);
