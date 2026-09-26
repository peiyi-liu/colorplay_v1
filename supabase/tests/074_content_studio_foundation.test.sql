begin;

set local search_path = public, extensions;

select plan(24);

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

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

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

reset role;

select * from finish();
rollback;
