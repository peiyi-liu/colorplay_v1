begin;

set local search_path = public, extensions;

select plan(64);

select has_table(
  'public',
  'assessment_banks',
  'Content Studio has an explicit assessment bank table'
);

select has_column(
  'public',
  'questions',
  'bank_id',
  'questions have one canonical assessment bank identity'
);

select has_table(
  'public',
  'content_drafts',
  'Content Studio drafts are persisted server-side'
);

select has_function(
  'public',
  'admin_save_content_draft',
  array['uuid', 'uuid', 'text', 'text', 'integer', 'jsonb', 'text', 'uuid'],
  'draft save is exposed only through the trusted command function'
);

select has_function(
  'public',
  'admin_list_content_scope',
  array['uuid'],
  'scope tree is exposed through a dedicated safe projection'
);

select has_column(
  'public',
  'questions',
  'duration_seconds',
  'question authoring has a server-constrained duration'
);

select throws_ok(
  $$
    update public.questions set duration_seconds = 121
    where id = (select id from public.questions order by id limit 1)
  $$,
  '23514',
  null,
  'question duration rejects values above 120 seconds'
);

select has_function(
  'public',
  'admin_read_content_editor_state',
  array['text', 'uuid', 'uuid'],
  'editor state has a dedicated privileged projection'
);

select has_function(
  'public',
  'admin_validate_content_draft',
  array['uuid', 'integer'],
  'draft validation has a dedicated privileged command'
);

select has_function(
  'public',
  'admin_preview_content_draft',
  array['uuid', 'integer'],
  'student-safe preview has a dedicated privileged projection'
);

select is(
  (
    select count(*)::integer
    from public.questions
    where bank_kind in ('section', 'chapter', 'live')
      and bank_id is null
  ),
  0,
  'every current QB, CR, and LT question is backfilled to one bank'
);

select is(
  (
    select count(*)::integer
    from public.questions as question
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    join public.assessment_banks as bank on bank.id = question.bank_id
    where (question.bank_kind = 'section'
        and (bank.kind <> 'QB' or bank.section_id <> section.id))
      or (question.bank_kind = 'live'
        and (bank.kind <> 'LT' or bank.section_id <> section.id))
      or (question.bank_kind = 'chapter'
        and (bank.kind <> 'CR' or bank.chapter_id <> section.chapter_id))
  ),
  0,
  'bank kind and parent scope match every current question'
);

select is(
  (
    select count(*)::integer
    from public.questions
    where bank_kind = 'legacy' and bank_id is not null
  ),
  0,
  'historical legacy questions do not masquerade as a current bank'
);

select throws_ok(
  $$
    insert into public.assessment_banks (
      stable_code, kind, chapter_id, title
    ) values (
      'QB-invalid-chapter', 'QB',
      (select id from public.chapters order by id limit 1),
      'Invalid QB'
    )
  $$,
  '23514',
  null,
  'QB rejects chapter scope'
);

select throws_ok(
  $$
    insert into public.assessment_banks (
      stable_code, kind, section_id, title
    ) values (
      'CR-invalid-section', 'CR',
      (select id from public.sections order by id limit 1),
      'Invalid CR'
    )
  $$,
  '23514',
  null,
  'CR rejects section scope'
);

select throws_ok(
  $$
    insert into public.assessment_banks (
      stable_code, kind, section_id, title, sort_order
    ) values (
      'LT-invalid-order', 'LT',
      (select id from public.sections order by id limit 1),
      'Invalid LT', -1
    )
  $$,
  '23514',
  null,
  'assessment banks reject invalid sort order'
);

select throws_ok(
  $$
    update public.assessment_banks
    set stable_code = stable_code || '-renamed'
    where id = (
      select id from public.assessment_banks
      where status = 'published'
      order by id limit 1
    )
  $$,
  '23514',
  null,
  'published assessment bank stable code is immutable'
);

select ok(
  not has_table_privilege('authenticated', 'public.content_drafts', 'SELECT'),
  'authenticated clients cannot read draft rows directly'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.content_draft_requests', 'SELECT'
  ),
  'authenticated clients cannot read idempotency receipts directly'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.question_options', 'is_correct', 'SELECT'
  ),
  'authenticated clients cannot read correct options directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_save_content_draft(uuid,uuid,text,text,integer,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the draft command'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_save_content_draft(uuid,uuid,text,text,integer,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated callers can reach the server-authorized draft command'
);

select ok(
  not has_function_privilege(
    'anon', 'public.admin_list_content_scope(uuid)', 'EXECUTE'
  ),
  'anonymous clients cannot execute the scope projection'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.admin_list_content_scope(uuid)', 'EXECUTE'
  ),
  'authenticated callers can reach the server-authorized scope projection'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_read_content_editor_state(text,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the editor-state projection'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_read_content_editor_state(text,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated callers can reach the server-authorized editor-state read'
);

select ok(
  not has_function_privilege(
    'anon', 'public.admin_validate_content_draft(uuid,integer)', 'EXECUTE'
  ),
  'anonymous clients cannot validate drafts'
);

select ok(
  not has_function_privilege(
    'anon', 'public.admin_preview_content_draft(uuid,integer)', 'EXECUTE'
  ),
  'anonymous clients cannot preview drafts'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_validate_content_draft(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated callers can reach server-authorized draft validation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_preview_content_draft(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated callers can reach the server-authorized safe preview'
);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select id as editor_question_id, stable_code as editor_question_code
from public.questions
where bank_kind = 'section'
order by stable_code
limit 1 \gset

select id as editor_bank_id,
  stable_code as editor_bank_code,
  section_id as editor_bank_section_id
from public.assessment_banks
where kind = 'QB'
order by stable_code
limit 1 \gset

select set_config(
  'request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (
    public.admin_save_content_draft(
      null, null, 'assessment_bank', 'QB-denied', 0,
      '{"kind":"QB"}'::jsonb, 'manual',
      '74000000-0000-4000-8000-000000000001'
    ) ->> 'code'
  ),
  'STALE_PRIVILEGED_SESSION',
  'a non-Admin authenticated caller receives a stable denial'
);

select is(
  (
    public.admin_list_content_scope(
      '21000000-0000-0000-0000-000000000003'
    ) ->> 'code'
  ),
  'STALE_PRIVILEGED_SESSION',
  'a non-Admin caller cannot read the Content Studio scope tree'
);

select is(
  (
    public.admin_read_content_editor_state(
      'question', :'editor_question_id'::uuid, null
    ) ->> 'code'
  ),
  'STALE_PRIVILEGED_SESSION',
  'a non-Admin caller cannot read privileged editor state'
);

select is(
  (
    public.admin_validate_content_draft(
      '74000000-0000-4000-8000-000000000099', 1
    ) ->> 'code'
  ),
  'STALE_PRIVILEGED_SESSION',
  'a non-Admin caller cannot validate a draft'
);

select is(
  (
    public.admin_preview_content_draft(
      '74000000-0000-4000-8000-000000000099', 1
    ) ->> 'code'
  ),
  'STALE_PRIVILEGED_SESSION',
  'a non-Admin caller cannot preview a draft'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select set_config(
  'pgtap.content_scope',
  public.admin_list_content_scope(
    '21000000-0000-0000-0000-000000000003'
  )::text,
  true
);

select is(
  current_setting('pgtap.content_scope')::jsonb ->> 'outcome',
  'ok',
  'an active privileged Admin can read the Content Studio scope tree'
);

select is(
  current_setting('pgtap.content_scope')::jsonb #>> '{chapter,id}',
  '21000000-0000-0000-0000-000000000003',
  'the scope projection is bound to the requested chapter'
);

select ok(
  current_setting('pgtap.content_scope') !~
    'is_correct|correct_option|payload|actor_user_id|request_hash',
  'the navigation projection contains no answer, draft, actor, or request hash'
);

select set_config(
  'pgtap.editor_state',
  public.admin_read_content_editor_state(
    'question', :'editor_question_id'::uuid, null
  )::text,
  true
);

select is(
  current_setting('pgtap.editor_state')::jsonb ->> 'outcome',
  'ok',
  'an active privileged Admin can read editor state'
);

select is(
  current_setting('pgtap.editor_state')::jsonb #>> '{current,entity_type}',
  'question',
  'editor state preserves the canonical entity type'
);

select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('pgtap.editor_state')::jsonb
        #> '{current,payload,options}'
    ) as option
    where (option ->> 'is_correct')::boolean
  ),
  1,
  'only the privileged editor projection receives the one correct option'
);

select is(
  current_setting('pgtap.editor_state')::jsonb -> 'draft',
  'null'::jsonb,
  'editor state reports an explicit null when no persistent draft exists'
);

select set_config(
  'pgtap.content_save',
  public.admin_save_content_draft(
    null, null, 'assessment_bank', 'QB-draft-31', 0,
    '{"kind":"QB","title":"3-1 小節題庫"}'::jsonb, 'manual',
    '74000000-0000-4000-8000-000000000002'
  )::text,
  true
);

select is(
  current_setting('pgtap.content_save')::jsonb ->> 'outcome',
  'ok',
  'an active privileged Admin can persist a new draft'
);

select is(
  current_setting('pgtap.content_save')::jsonb #>> '{draft,revision}',
  '1',
  'the first persistent draft starts at revision one'
);

select set_config(
  'pgtap.content_replay',
  public.admin_save_content_draft(
    null, null, 'assessment_bank', 'QB-draft-31', 0,
    '{"kind":"QB","title":"3-1 小節題庫"}'::jsonb, 'manual',
    '74000000-0000-4000-8000-000000000002'
  )::text,
  true
);

select is(
  current_setting('pgtap.content_replay')::jsonb ->> 'replayed',
  'true',
  'the same request id returns the original receipt as a replay'
);

reset role;
select is(
  (
    select revision::text
    from public.content_drafts
    where id = (
      current_setting('pgtap.content_save')::jsonb #>> '{draft,draft_id}'
    )::uuid
  ),
  '1',
  'idempotent replay does not create another revision'
);
set local role authenticated;

select set_config(
  'pgtap.content_stale',
  public.admin_save_content_draft(
    (current_setting('pgtap.content_save')::jsonb #>> '{draft,draft_id}')::uuid,
    null, 'assessment_bank', 'QB-draft-31', 0,
    '{"kind":"QB","title":"stale overwrite"}'::jsonb, 'manual',
    '74000000-0000-4000-8000-000000000003'
  )::text,
  true
);

select is(
  current_setting('pgtap.content_stale')::jsonb ->> 'code',
  'CONTENT_DRAFT_CONFLICT',
  'a stale expected revision cannot overwrite a newer draft'
);

reset role;
select is(
  (
    select revision::text || '|' || (payload ->> 'title')
    from public.content_drafts
    where id = (
      current_setting('pgtap.content_save')::jsonb #>> '{draft,draft_id}'
    )::uuid
  ),
  '1|3-1 小節題庫',
  'a stale save leaves the stored revision and payload unchanged'
);
set local role authenticated;

select is(
  (
    public.admin_save_content_draft(
      null, null, 'assessment_bank', 'QB-draft-31', 0,
      '{"kind":"QB","title":"different request body"}'::jsonb,
      'manual', '74000000-0000-4000-8000-000000000002'
    ) ->> 'code'
  ),
  'IDEMPOTENCY_CONFLICT',
  'one request id cannot be replayed with a different body'
);

select set_config(
  'pgtap.invalid_bank_validation',
  public.admin_validate_content_draft(
    (current_setting('pgtap.content_save')::jsonb #>> '{draft,draft_id}')::uuid,
    1
  )::text,
  true
);

select is(
  current_setting('pgtap.invalid_bank_validation')::jsonb ->> 'outcome',
  'ok',
  'server validation returns a deterministic report for invalid WIP'
);

select is(
  current_setting('pgtap.invalid_bank_validation')::jsonb ->> 'valid',
  'false',
  'a QB draft without section scope is invalid'
);

select is(
  current_setting('pgtap.invalid_bank_validation')::jsonb
    #>> '{issues,0,code}',
  'CONTENT_BANK_SCOPE_INVALID',
  'invalid bank scope has a stable field-level code'
);

select is(
  (
    public.admin_preview_content_draft(
      (current_setting('pgtap.content_save')::jsonb
        #>> '{draft,draft_id}')::uuid,
      1
    ) ->> 'code'
  ),
  'CONTENT_VALIDATION_FAILED',
  'invalid drafts cannot produce a student preview'
);

select set_config(
  'pgtap.valid_question_save',
  public.admin_save_content_draft(
    null, null, 'question', 'QB3199', 0,
    jsonb_build_object(
      'bank_id', :'editor_bank_id',
      'question_type', 'single_choice',
      'prompt', '哪個色彩系統使用 HV/C？',
      'explanation', '孟賽爾系統使用色相、明度和彩度。',
      'duration_seconds', 30,
      'sort_order', 99,
      'options', jsonb_build_array(
        jsonb_build_object(
          'key', 'A', 'text', '孟賽爾', 'is_correct', true
        ),
        jsonb_build_object(
          'key', 'B', 'text', '奧斯華德', 'is_correct', false
        )
      )
    ),
    'manual', '74000000-0000-4000-8000-000000000004'
  )::text,
  true
);

select is(
  current_setting('pgtap.valid_question_save')::jsonb ->> 'outcome',
  'ok',
  'a normalized question WIP is persisted before validation'
);

select set_config(
  'pgtap.valid_question_validation',
  public.admin_validate_content_draft(
    (current_setting('pgtap.valid_question_save')::jsonb
      #>> '{draft,draft_id}')::uuid,
    1
  )::text,
  true
);

select is(
  current_setting('pgtap.valid_question_validation')::jsonb ->> 'valid',
  'true',
  'a canonical single-choice question passes server validation'
);

select set_config(
  'pgtap.valid_question_preview',
  public.admin_preview_content_draft(
    (current_setting('pgtap.valid_question_save')::jsonb
      #>> '{draft,draft_id}')::uuid,
    1
  )::text,
  true
);

select is(
  current_setting('pgtap.valid_question_preview')::jsonb ->> 'outcome',
  'ok',
  'a valid question produces a student preview'
);

select ok(
  current_setting('pgtap.valid_question_preview') !~
    'is_correct|explanation|bank_id|actor_user_id|request_hash',
  'question preview strips answers, explanation, bank, actor, and request data'
);

select is(
  jsonb_array_length(
    current_setting('pgtap.valid_question_preview')::jsonb
      #> '{projection,options}'
  ),
  2,
  'student preview preserves the visible option set'
);

select is(
  (
    public.admin_validate_content_draft(
      (current_setting('pgtap.valid_question_save')::jsonb
        #>> '{draft,draft_id}')::uuid,
      0
    ) ->> 'code'
  ),
  'CONTENT_DRAFT_CONFLICT',
  'validation rejects a stale expected revision'
);

select set_config(
  'pgtap.invalid_sort_save',
  public.admin_save_content_draft(
    null, null, 'section', 'section-invalid-sort', 0,
    jsonb_build_object(
      'chapter_id', '21000000-0000-0000-0000-000000000003',
      'title', '排序錯誤小節', 'description', '', 'sort_order', -1
    ),
    'manual', '74000000-0000-4000-8000-000000000005'
  )::text,
  true
);
select set_config(
  'pgtap.invalid_sort_validation',
  public.admin_validate_content_draft(
    (current_setting('pgtap.invalid_sort_save')::jsonb
      #>> '{draft,draft_id}')::uuid,
    1
  )::text,
  true
);
select is(
  current_setting('pgtap.invalid_sort_validation')::jsonb ->> 'valid',
  'false',
  'negative sort order fails server validation'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      current_setting('pgtap.invalid_sort_validation')::jsonb -> 'issues'
    ) as issue
    where issue ->> 'code' = 'CONTENT_SORT_ORDER_INVALID'
  ),
  'invalid sort order has a stable field-level code'
);

select set_config(
  'pgtap.duplicate_question_save',
  public.admin_save_content_draft(
    null, null, 'question', :'editor_question_code', 0,
    jsonb_build_object(
      'bank_id', :'editor_bank_id', 'question_type', 'single_choice',
      'prompt', '重複代碼題目', 'explanation', '重複代碼驗證',
      'duration_seconds', 30, 'sort_order', 100,
      'options', jsonb_build_array(
        jsonb_build_object('key', 'A', 'text', '甲', 'is_correct', true),
        jsonb_build_object('key', 'B', 'text', '乙', 'is_correct', false)
      )
    ),
    'manual', '74000000-0000-4000-8000-000000000006'
  )::text,
  true
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.admin_validate_content_draft(
        (current_setting('pgtap.duplicate_question_save')::jsonb
          #>> '{draft,draft_id}')::uuid,
        1
      ) -> 'issues'
    ) as issue
    where issue ->> 'code' = 'CONTENT_DUPLICATE_STABLE_CODE'
  ),
  'duplicate stable code is rejected by server validation'
);

select set_config(
  'pgtap.renamed_question_save',
  public.admin_save_content_draft(
    null, :'editor_question_id'::uuid, 'question', 'QB-renamed', 0,
    jsonb_build_object(
      'bank_id', :'editor_bank_id', 'question_type', 'single_choice',
      'prompt', '改名題目', 'explanation', '改名驗證',
      'duration_seconds', 30, 'sort_order', 101,
      'options', jsonb_build_array(
        jsonb_build_object('key', 'A', 'text', '甲', 'is_correct', true),
        jsonb_build_object('key', 'B', 'text', '乙', 'is_correct', false)
      )
    ),
    'manual', '74000000-0000-4000-8000-000000000007'
  )::text,
  true
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.admin_validate_content_draft(
        (current_setting('pgtap.renamed_question_save')::jsonb
          #>> '{draft,draft_id}')::uuid,
        1
      ) -> 'issues'
    ) as issue
    where issue ->> 'code' = 'CONTENT_STABLE_CODE_IMMUTABLE'
  ),
  'published question stable code rename is rejected'
);

select set_config(
  'pgtap.cross_kind_bank_save',
  public.admin_save_content_draft(
    null, :'editor_bank_id'::uuid, 'assessment_bank',
    :'editor_bank_code', 0,
    jsonb_build_object(
      'kind', 'LT', 'section_id', :'editor_bank_section_id',
      'title', '跨類型題庫', 'description', '', 'sort_order', 1
    ),
    'manual', '74000000-0000-4000-8000-000000000008'
  )::text,
  true
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.admin_validate_content_draft(
        (current_setting('pgtap.cross_kind_bank_save')::jsonb
          #>> '{draft,draft_id}')::uuid,
        1
      ) -> 'issues'
    ) as issue
    where issue ->> 'code' = 'CONTENT_BANK_SCOPE_IMMUTABLE'
  ),
  'published bank cannot move across QB, CR, and LT kinds'
);

reset role;

select * from finish();
rollback;
