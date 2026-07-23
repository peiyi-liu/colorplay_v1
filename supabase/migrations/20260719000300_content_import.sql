-- Transactional teacher content import. The client parses the XLSX and sends
-- typed rows; the server re-validates every row (never trusting the client's
-- verdict), applies all-or-nothing upserts by stable code through the
-- versioning machinery, and always persists a report. A mid-apply DB failure
-- rolls the content changes back (subtransaction) while the failed report
-- itself survives. Imports never delete content, so the verified question
-- baseline is preserved by construction. Imported creations land as drafts;
-- students only see content once it is published.

create type public.content_import_status as enum ('committed', 'failed');

create table public.content_imports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  filename text not null check (char_length(btrim(filename)) between 1 and 255),
  dry_run boolean not null default false,
  total_rows integer not null check (total_rows >= 0),
  valid_rows integer not null check (valid_rows >= 0),
  error_rows integer not null check (error_rows >= 0),
  warning_rows integer not null default 0 check (warning_rows >= 0),
  status public.content_import_status not null,
  row_errors jsonb not null default '[]',
  created_ids jsonb not null default '[]',
  created_at timestamptz not null default clock_timestamp(),
  constraint content_imports_teacher_request_unique
    unique (teacher_id, request_id)
);

alter table public.content_imports enable row level security;

grant select on public.content_imports to authenticated;

create policy content_imports_own_select on public.content_imports
for select to authenticated
using (teacher_id = (select auth.uid()));

-- Validates one question row; returns an error array (empty = valid).
create function public.validate_import_question_row(p_row jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  errors jsonb := '[]';
  code text := btrim(coalesce(p_row ->> 'code', ''));
  prompt text := btrim(coalesce(p_row ->> 'prompt', ''));
  explanation text := btrim(coalesce(p_row ->> 'explanation', ''));
  answer text := upper(btrim(coalesce(p_row ->> 'answer', '')));
  options jsonb := coalesce(p_row -> 'options', '[]');
  option_count integer;
  answer_key text;
  row_no integer := coalesce((p_row ->> 'row')::integer, 0);
  sheet constant text := '題庫';
begin
  if code !~ '^[0-9]+-[0-9]+-[0-9]{2}$' then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '題號',
      'code', 'CODE_FORMAT', 'message', '題號格式需為 章-節-兩位序號'
    );
  end if;
  if char_length(prompt) not between 1 and 1000 then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '題目',
      'code', 'PROMPT_INVALID', 'message', '題目需為 1–1000 字'
    );
  end if;
  if prompt ~* '<script' or prompt ~* '\mon[a-z]+\s*='
    or explanation ~* '<script' or explanation ~* '\mon[a-z]+\s*=' then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '題目',
      'code', 'UNSAFE_TEXT', 'message', '內容含不允許的 script 或事件屬性'
    );
  end if;
  select count(*)::integer into option_count
  from jsonb_array_elements(options) entry
  where btrim(coalesce(entry ->> 'text', '')) <> '';
  if option_count < 2 or option_count > 4 or exists (
    select 1 from jsonb_array_elements(options) entry
    where char_length(entry ->> 'text') > 500
      or (entry ->> 'text') ~* '<script'
      or (entry ->> 'text') ~* '\mon[a-z]+\s*='
  ) then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '選項',
      'code', 'OPTIONS_INVALID', 'message', '需要 2–4 個安全的非空選項'
    );
  end if;
  answer_key := case answer
    when '1' then 'A' when '2' then 'B' when '3' then 'C' when '4' then 'D'
    when 'A' then 'A' when 'B' then 'B' when 'C' then 'C' when 'D' then 'D'
    else null
  end;
  if answer_key is null then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '正解',
      'code', 'ANSWER_INVALID',
      'message', '正解需為 A–D 或 1–4，不可留空或其他值'
    );
  elsif not exists (
    select 1 from jsonb_array_elements(options) entry
    where entry ->> 'key' = answer_key
      and btrim(coalesce(entry ->> 'text', '')) <> ''
  ) then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '正解',
      'code', 'ANSWER_OPTION_MISSING', 'message', '正解指向的選項不存在或為空白'
    );
  end if;
  if char_length(explanation) > 2000 then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '解析',
      'code', 'EXPLANATION_INVALID', 'message', '解析超過 2000 字'
    );
  end if;
  if not exists (
    select 1 from public.chapters ch
    where ch.stable_code = 'chapter-' || btrim(coalesce(p_row ->> 'chapter', ''))
  ) then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '章節編號',
      'code', 'CHAPTER_NOT_FOUND', 'message', '章節編號沒有對應的平台章節'
    );
  end if;
  if btrim(coalesce(p_row ->> 'section_label', '')) !~ '^[0-9]+-[0-9]+' then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '小節',
      'code', 'SECTION_INVALID', 'message', '小節需含 n-n 編號前綴'
    );
  end if;
  return errors;
end;
$$;

revoke all on function public.validate_import_question_row(jsonb)
from public, anon, authenticated;

create function public.validate_import_review_card_row(p_row jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  errors jsonb := '[]';
  title text := btrim(coalesce(p_row ->> 'title', ''));
  content text := btrim(coalesce(p_row ->> 'content', ''));
  media_url text := btrim(coalesce(p_row ->> 'media_url', ''));
  alt_text text := btrim(coalesce(p_row ->> 'alt_text', ''));
  row_no integer := coalesce((p_row ->> 'row')::integer, 0);
  sheet constant text := '複習卡';
begin
  if char_length(title) not between 1 and 200 then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '卡片標題',
      'code', 'TITLE_INVALID', 'message', '卡片標題需為 1–200 字'
    );
  end if;
  if char_length(content) not between 1 and 8000 then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '卡片內容',
      'code', 'CONTENT_INVALID', 'message', '卡片內容需為 1–8000 字'
    );
  end if;
  if title ~* '<script' or title ~* '\mon[a-z]+\s*='
    or content ~* '<script' or content ~* '\mon[a-z]+\s*=' then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '卡片內容',
      'code', 'UNSAFE_TEXT', 'message', '內容含不允許的 script 或事件屬性'
    );
  end if;
  if media_url <> '' and alt_text = '' then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '替代文字',
      'code', 'MEDIA_ALT_REQUIRED', 'message', '有圖片網址時必須填寫替代文字'
    );
  end if;
  if not exists (
    select 1 from public.chapters ch
    where ch.stable_code = 'chapter-' || btrim(coalesce(p_row ->> 'chapter', ''))
  ) then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '章節編號',
      'code', 'CHAPTER_NOT_FOUND', 'message', '章節編號沒有對應的平台章節'
    );
  end if;
  if btrim(coalesce(p_row ->> 'section_label', '')) !~ '^[0-9]+-[0-9]+' then
    errors := errors || jsonb_build_object(
      'sheet', sheet, 'row', row_no, 'field', '小節',
      'code', 'SECTION_INVALID', 'message', '小節需含 n-n 編號前綴'
    );
  end if;
  return errors;
end;
$$;

revoke all on function public.validate_import_review_card_row(jsonb)
from public, anon, authenticated;

-- Ensures the section/subtopic pair derived from a 小節 label exists and
-- returns the subtopic id. Uses the same stable codes as the sheet importer
-- so both import paths converge on the same rows.
create function public.ensure_import_subtopic(
  p_chapter text,
  p_section_label text
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  chapter_record public.chapters;
  section_key text := (regexp_match(btrim(p_section_label), '^([0-9]+-[0-9]+)'))[1];
  section_id uuid;
  subtopic_id uuid;
  section_sort integer;
begin
  select * into chapter_record
  from public.chapters
  where stable_code = 'chapter-' || btrim(p_chapter);
  section_sort := split_part(section_key, '-', 2)::integer;

  select id into section_id
  from public.sections
  where stable_code = 'sheet-' || section_key;
  if section_id is null then
    insert into public.sections (
      chapter_id, stable_code, title, description, status, sort_order
    ) values (
      chapter_record.id, 'sheet-' || section_key, btrim(p_section_label), '',
      'published', section_sort
    )
    returning id into section_id;
  end if;

  select id into subtopic_id
  from public.subtopics
  where stable_code = 'sheet-' || section_key || '-all';
  if subtopic_id is null then
    insert into public.subtopics (
      section_id, stable_code, title, description, status, sort_order
    ) values (
      section_id, 'sheet-' || section_key || '-all', btrim(p_section_label),
      '', 'published', 1
    )
    returning id into subtopic_id;
  end if;
  return subtopic_id;
end;
$$;

revoke all on function public.ensure_import_subtopic(text, text)
from public, anon, authenticated;

create function public.commit_content_import(
  p_rows jsonb,
  p_request_id uuid,
  p_filename text,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  existing public.content_imports;
  question_rows jsonb := coalesce(p_rows -> 'questions', '[]');
  card_rows jsonb := coalesce(p_rows -> 'review_cards', '[]');
  chapter_rows jsonb := coalesce(p_rows -> 'chapters', '[]');
  all_errors jsonb := '[]';
  created jsonb := '[]';
  entry jsonb;
  row_errors jsonb;
  total integer;
  import_row public.content_imports;
  subtopic uuid;
  target public.questions;
  card_target public.review_cards;
  payload jsonb;
  card_code text;
  identity text;
  apply_failed boolean := false;
  failure_message text;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;

  select * into existing
  from public.content_imports
  where teacher_id = actor and request_id = p_request_id;
  if existing.id is not null then
    return jsonb_build_object(
      'import_id', existing.id,
      'status', existing.status,
      'total_rows', existing.total_rows,
      'valid_rows', existing.valid_rows,
      'error_rows', existing.error_rows,
      'row_errors', existing.row_errors,
      'created', existing.created_ids,
      'replayed', true
    );
  end if;

  total := jsonb_array_length(question_rows)
    + jsonb_array_length(card_rows)
    + jsonb_array_length(chapter_rows);
  if total = 0 or total > 500 then
    raise exception using errcode = 'P0001', message = 'CONTENT_IMPORT_EMPTY_OR_TOO_LARGE';
  end if;

  for entry in select value from jsonb_array_elements(question_rows)
  loop
    row_errors := public.validate_import_question_row(entry);
    all_errors := all_errors || row_errors;
  end loop;
  for entry in select value from jsonb_array_elements(card_rows)
  loop
    row_errors := public.validate_import_review_card_row(entry);
    all_errors := all_errors || row_errors;
  end loop;

  if jsonb_array_length(all_errors) = 0 and not p_dry_run then
    begin
      for entry in select value from jsonb_array_elements(chapter_rows)
      loop
        update public.chapters
        set title = coalesce(
              nullif(btrim(entry ->> 'title'), ''), title
            ),
            description = coalesce(
              nullif(btrim(entry ->> 'description'), ''), description
            ),
            updated_at = clock_timestamp()
        where stable_code = 'chapter-' || btrim(coalesce(entry ->> 'chapter', ''));
      end loop;

      for entry in select value from jsonb_array_elements(question_rows)
      loop
        subtopic := public.ensure_import_subtopic(
          entry ->> 'chapter', entry ->> 'section_label'
        );
        payload := jsonb_build_object(
          'stable_code', btrim(entry ->> 'code'),
          'subtopic_id', subtopic,
          'prompt', btrim(entry ->> 'prompt'),
          'explanation', btrim(entry ->> 'explanation'),
          'options', (
            select jsonb_agg(
              jsonb_build_object(
                'key', o ->> 'key',
                'text', btrim(o ->> 'text'),
                'is_correct', (o ->> 'key') = case upper(btrim(entry ->> 'answer'))
                  when '1' then 'A' when '2' then 'B'
                  when '3' then 'C' when '4' then 'D'
                  else upper(btrim(entry ->> 'answer'))
                end
              )
            )
            from jsonb_array_elements(entry -> 'options') o
            where btrim(coalesce(o ->> 'text', '')) <> ''
          )
        );
        select * into target
        from public.questions
        where stable_code = btrim(entry ->> 'code')
        for update;
        if target.id is null then
          perform public.apply_question_payload(null, payload);
          created := created || jsonb_build_object(
            'type', 'question', 'stable_code', btrim(entry ->> 'code'),
            'action', 'created'
          );
        elsif target.status = 'published' then
          if public.question_semantic_payload(target.id)
            is distinct from (
              payload || jsonb_build_object(
                'options', (
                  select coalesce(jsonb_agg(o order by o ->> 'key'), '[]'::jsonb)
                  from jsonb_array_elements(payload -> 'options') o
                )
              )
            ) then
            perform public.apply_question_payload(target.id, payload);
            update public.questions
            set version = target.version + 1, updated_at = clock_timestamp()
            where id = target.id;
            perform public.record_content_version(
              'question', target.id, target.version + 1,
              public.question_semantic_payload(target.id), 'published', actor
            );
            insert into public.content_publication_events (
              content_type, content_id, version, event_type, actor_id,
              request_id
            ) values (
              'question', target.id, target.version + 1, 'publish', actor,
              p_request_id
            );
            created := created || jsonb_build_object(
              'type', 'question', 'stable_code', btrim(entry ->> 'code'),
              'action', 'versioned'
            );
          else
            created := created || jsonb_build_object(
              'type', 'question', 'stable_code', btrim(entry ->> 'code'),
              'action', 'noop'
            );
          end if;
        else
          perform public.apply_question_payload(target.id, payload);
          created := created || jsonb_build_object(
            'type', 'question', 'stable_code', btrim(entry ->> 'code'),
            'action', 'updated'
          );
        end if;
      end loop;

      for entry in select value from jsonb_array_elements(card_rows)
      loop
        subtopic := public.ensure_import_subtopic(
          entry ->> 'chapter', entry ->> 'section_label'
        );
        identity := (regexp_match(btrim(entry ->> 'section_label'), '^([0-9]+-[0-9]+)'))[1]
          || ':' || btrim(coalesce(entry ->> 'subtopic_label', ''))
          || ':' || btrim(entry ->> 'title');
        card_code := 'sheet-card-'
          || (regexp_match(btrim(entry ->> 'section_label'), '^([0-9]+-[0-9]+)'))[1]
          || '-' || substr(md5(identity), 1, 12);
        payload := jsonb_build_object(
          'stable_code', card_code,
          'subtopic_id', subtopic,
          'group_label', btrim(coalesce(entry ->> 'subtopic_label', '')),
          'title', btrim(entry ->> 'title'),
          'content', btrim(entry ->> 'content'),
          'requires_recompletion', false,
          'media', case
            when btrim(coalesce(entry ->> 'media_url', '')) <> '' then
              jsonb_build_array(
                jsonb_build_object(
                  'asset_path', btrim(entry ->> 'media_url'),
                  'alt_text', btrim(entry ->> 'alt_text')
                )
              )
            else '[]'::jsonb
          end
        );
        select * into card_target
        from public.review_cards
        where stable_code = card_code
        for update;
        if card_target.id is null then
          perform public.apply_review_card_payload(null, payload, 1);
          created := created || jsonb_build_object(
            'type', 'review_card', 'stable_code', card_code,
            'action', 'created'
          );
        elsif card_target.status = 'published' then
          perform public.apply_review_card_payload(
            card_target.id, payload, card_target.version + 1
          );
          update public.review_cards
          set version = card_target.version + 1,
              updated_at = clock_timestamp()
          where id = card_target.id;
          perform public.record_content_version(
            'review_card', card_target.id, card_target.version + 1,
            public.review_card_semantic_payload(card_target.id), 'published',
            actor
          );
          created := created || jsonb_build_object(
            'type', 'review_card', 'stable_code', card_code,
            'action', 'versioned'
          );
        else
          perform public.apply_review_card_payload(
            card_target.id, payload, card_target.version
          );
          created := created || jsonb_build_object(
            'type', 'review_card', 'stable_code', card_code,
            'action', 'updated'
          );
        end if;
      end loop;
    exception
      when others then
        apply_failed := true;
        failure_message := sqlerrm;
        created := '[]';
        all_errors := all_errors || jsonb_build_object(
          'sheet', '', 'row', 0, 'field', '匯入',
          'code', 'COMMIT_FAILED',
          'message', '匯入交易失敗，所有變更已回滾：' || failure_message
        );
    end;
  end if;

  insert into public.content_imports (
    teacher_id, request_id, filename, dry_run, total_rows, valid_rows,
    error_rows, status, row_errors, created_ids
  ) values (
    actor, p_request_id, btrim(p_filename), p_dry_run, total,
    total - (
      select count(distinct (e ->> 'row'))::integer
      from jsonb_array_elements(all_errors) e
      where (e ->> 'row')::integer > 0
    ),
    (
      select count(distinct (e ->> 'row'))::integer
      from jsonb_array_elements(all_errors) e
      where (e ->> 'row')::integer > 0
    ),
    case
      when jsonb_array_length(all_errors) > 0 or apply_failed
        then 'failed'::public.content_import_status
      else 'committed'::public.content_import_status
    end,
    all_errors, created
  )
  returning * into import_row;

  return jsonb_build_object(
    'import_id', import_row.id,
    'status', import_row.status,
    'total_rows', import_row.total_rows,
    'valid_rows', import_row.valid_rows,
    'error_rows', import_row.error_rows,
    'row_errors', import_row.row_errors,
    'created', import_row.created_ids,
    'replayed', false
  );
end;
$$;

revoke all on function public.commit_content_import(jsonb, uuid, text, boolean)
from public, anon;
grant execute on function public.commit_content_import(jsonb, uuid, text, boolean)
to authenticated;
