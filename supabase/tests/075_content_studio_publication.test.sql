begin;

set local search_path = public, extensions;

select plan(60);

select has_table('public', 'content_publication_requests',
  'publication commands persist private idempotency receipts');
select has_column('public', 'content_versions', 'impact',
  'immutable versions record the server-classified progress impact');
select has_column('public', 'content_versions', 'changed_fields',
  'immutable versions record a deterministic changed-field digest');
select has_column('public', 'content_publication_events', 'version_id',
  'each event points to its immutable version');
select has_function('public', 'admin_publish_content_draft',
  array['uuid','integer','text','uuid','text'],
  'draft publication is a dedicated trusted command');
select has_function('public', 'admin_archive_content',
  array['uuid','text','integer','text','uuid'],
  'archive is a dedicated trusted command');
select has_function('public', 'admin_rollback_content',
  array['uuid','text','integer','integer','text','uuid'],
  'rollback is a dedicated trusted command');
select has_function('public', 'admin_list_content_history',
  array['uuid','text'], 'history uses a safe Admin projection');

select ok(not has_table_privilege(
  'authenticated', 'public.content_publication_requests', 'SELECT'),
  'authenticated clients cannot read publication receipts directly');
select ok(not has_table_privilege(
  'authenticated', 'public.content_versions', 'SELECT'),
  'browser clients cannot read frozen version payloads directly');
select ok(not has_function_privilege(
  'anon', 'public.admin_publish_content_draft(uuid,integer,text,uuid,text)',
  'EXECUTE'), 'anonymous clients cannot publish content');
select ok(has_function_privilege(
  'authenticated', 'public.admin_publish_content_draft(uuid,integer,text,uuid,text)',
  'EXECUTE'), 'authenticated callers can reach the authorized publish command');
select ok(not has_function_privilege(
  'authenticated', 'public.publish_question(uuid,jsonb,uuid)', 'EXECUTE'),
  'the superseded Teacher question publisher cannot bypass Admin publication');
select ok(not has_function_privilege(
  'authenticated', 'public.publish_review_card(uuid,jsonb,uuid)', 'EXECUTE'),
  'the superseded Teacher card publisher cannot bypass Admin publication');
select ok(not has_function_privilege(
  'authenticated', 'public.commit_content_import(jsonb,uuid,text,boolean)',
  'EXECUTE'), 'legacy import cannot bypass draft-only Admin publication');
select ok(not has_function_privilege(
  'authenticated', 'public.upsert_question_draft(jsonb,uuid)', 'EXECUTE'),
  'legacy current-row drafts cannot bypass Content Studio drafts');

select is(content_private.publication_impact(
  'review_card', '{"title":"相同","content":"相同","sort_order":1}',
  '{"title":"相同","content":"相同","sort_order":2}'), 'compatible',
  'review-card ordering changes preserve current completion');
select is(content_private.publication_impact(
  'review_card', '{"title":"相同","content":"舊教學"}',
  '{"title":"相同","content":"新教學"}'), 'requires_recompletion',
  'review-card teaching changes require recompletion');
select is(content_private.publication_impact(
  'review_card', '{"title":"相同","content":"錯字"}',
  '{"title":"相同","content":"正字"}', 'nonsemantic'), 'compatible',
  'review-card typo corrections preserve current completion when classified');
select is(content_private.publication_impact(
  'review_card',
  '{"media":[{"manifest_id":"11111111-1111-4111-8111-111111111111","semantic_role":"color_critical","alt_text":"舊替代文字","sort_order":0}]}',
  '{"media":[{"manifest_id":"11111111-1111-4111-8111-111111111111","semantic_role":"color_critical","alt_text":"新替代文字","sort_order":0}]}',
  'nonsemantic'), 'compatible',
  'media alt-text-only corrections preserve current completion');
select is(content_private.publication_impact(
  'review_card',
  '{"media":[{"manifest_id":"11111111-1111-4111-8111-111111111111","semantic_role":"color_critical","alt_text":"圖","sort_order":0}]}',
  '{"media":[{"manifest_id":"22222222-2222-4222-8222-222222222222","semantic_role":"color_critical","alt_text":"圖","sort_order":0}]}',
  'nonsemantic'), 'requires_recompletion',
  'nonsemantic classification cannot hide a media asset replacement');
select is(content_private.publication_impact(
  'question', '{"prompt":"舊題意","options":[]}',
  '{"prompt":"新題意","options":[]}'), 'requires_requalification',
  'question meaning changes require requalification');
select is(content_private.publication_impact(
  'question',
  '{"options":[{"key":"A","text":"錯字","is_correct":true},{"key":"B","text":"其他","is_correct":false}]}',
  '{"options":[{"key":"A","text":"正字","is_correct":true},{"key":"B","text":"其他","is_correct":false}]}',
  'nonsemantic'), 'compatible',
  'option typo corrections preserve qualification when answer identity is unchanged');
select is(content_private.publication_impact(
  'question',
  '{"options":[{"key":"A","text":"甲","is_correct":true},{"key":"B","text":"乙","is_correct":false}]}',
  '{"options":[{"key":"A","text":"甲","is_correct":false},{"key":"B","text":"乙","is_correct":true}]}',
  'nonsemantic'), 'requires_requalification',
  'nonsemantic classification cannot hide a correct-answer change');
select is(content_private.publication_impact(
  'assessment_bank', '{"selection_settings":{"count":10}}',
  '{"selection_settings":{"count":20}}'), 'requires_requalification',
  'bank selection changes require requalification');
select is(content_private.publication_impact(
  'assessment_bank', '{"selection_settings":{"count":10}}',
  '{"selection_settings":{"count":20}}', 'nonsemantic'),
  'requires_requalification',
  'nonsemantic classification cannot override bank selection changes');
select is(content_private.publication_impact(
  'question', '{"duration_seconds":20,"sort_order":1}',
  '{"duration_seconds":30,"sort_order":1}'), 'requires_requalification',
  'question duration changes require requalification');

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select id as publication_subtopic_id
from public.subtopics where stable_code = 'sheet-3-1-all' limit 1 \gset
select s.chapter_id as publication_chapter_id
from public.subtopics st join public.sections s on s.id = st.section_id
where st.id = :'publication_subtopic_id'::uuid \gset
select bank.id as publication_bank_id
from public.assessment_banks bank
join public.subtopics subtopic on subtopic.section_id = bank.section_id
where subtopic.id = :'publication_subtopic_id'::uuid and bank.kind = 'QB'
limit 1 \gset

select ok((select count(*) from content_private.current_assessment_questions
  where bank_id = :'publication_bank_id'::uuid) > 0,
  'published canonical bank questions are selectable');
update public.assessment_banks set status = 'archived'
where id = :'publication_bank_id'::uuid;
select is((select count(*)::text
  from content_private.current_assessment_questions
  where bank_id = :'publication_bank_id'::uuid), '0',
  'archiving a canonical bank immediately removes its current question pool');
update public.assessment_banks set status = 'published'
where id = :'publication_bank_id'::uuid;

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(public.admin_publish_content_draft(
  '75000000-0000-4000-8000-000000000099', 1, 'unauthorized',
  '75000000-0000-4000-8000-000000000001') ->> 'code',
  'STALE_PRIVILEGED_SESSION',
  'Student cannot publish a content draft');

reset role;
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select set_config('pgtap.publication_save', public.admin_save_content_draft(
  null, null, 'review_card', 'RC-P2-NEW', 0,
  jsonb_build_object(
    'subtopic_id', :'publication_subtopic_id', 'group_label', '3-1',
    'title', '新內容', 'content', '第一版教學內容。',
    'requires_recompletion', false, 'sort_order', 999, 'media', '[]'::jsonb
  ), 'manual', '75000000-0000-4000-8000-000000000002')::text, true);

select is(current_setting('pgtap.publication_save')::jsonb ->> 'outcome',
  'ok', 'a valid new review card can be saved as a draft');

select set_config('pgtap.publication_first', public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  1, '新增必要複習卡',
  '75000000-0000-4000-8000-000000000003')::text, true);

select is(current_setting('pgtap.publication_first')::jsonb ->> 'outcome',
  'ok', 'Admin publishes the exact validated draft revision');
select is(current_setting('pgtap.publication_first')::jsonb ->> 'impact',
  'requires_recompletion',
  'a new required review card has no grandfather exemption');
select is(current_setting('pgtap.publication_first')::jsonb ->> 'version',
  '1', 'new published content starts at version one');

select set_config('pgtap.publication_replay', public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  1, '新增必要複習卡',
  '75000000-0000-4000-8000-000000000003')::text, true);
select is(current_setting('pgtap.publication_replay')::jsonb ->> 'replayed',
  'true', 'the same publish request returns the original receipt');

select is(public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  1, '重複送出相同內容',
  '75000000-0000-4000-8000-000000000011') ->> 'code',
  'CONTENT_VALIDATION_FAILED',
  'a different request cannot republish an unchanged draft');

reset role;
select is((select count(*)::text from public.content_publication_events
  where request_id = '75000000-0000-4000-8000-000000000003'), '1',
  'idempotent replay does not append a duplicate event');
select is((select count(*)::text from public.content_versions
  where content_type = 'review_card' and content_id =
    (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid),
  '1', 'unchanged republish does not append a duplicate version');

update public.admin_sessions
set last_totp_verified_at = now() - interval '10 minutes'
where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  1, 'stale mfa publish', '75000000-0000-4000-8000-000000000012'
) ->> 'code', 'INSUFFICIENT_MFA', 'stale MFA cannot publish');
select is(public.admin_archive_content(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 1, 'stale mfa archive',
  '75000000-0000-4000-8000-000000000013'
) ->> 'code', 'INSUFFICIENT_MFA', 'stale MFA cannot archive');
select is(public.admin_rollback_content(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 1, 1, 'stale mfa rollback',
  '75000000-0000-4000-8000-000000000014'
) ->> 'code', 'INSUFFICIENT_MFA', 'stale MFA cannot roll back');

reset role;
update public.admin_sessions set last_totp_verified_at = now()
where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e9', true);
set local role authenticated;
select is(public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  1, 'rotated session publish', '75000000-0000-4000-8000-000000000015'
) ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a rotated auth session cannot replay publication state');
select is(public.admin_archive_content(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 1, 'rotated session archive',
  '75000000-0000-4000-8000-000000000016'
) ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a rotated auth session cannot archive');
select is(public.admin_rollback_content(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 1, 1, 'rotated session rollback',
  '75000000-0000-4000-8000-000000000017'
) ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a rotated auth session cannot roll back');

reset role;
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);

insert into public.review_progress(
  user_id, review_card_id, card_version, request_id
) values (
  'cc000000-0000-0000-0000-000000000001',
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  1, '75000000-0000-4000-8000-000000000004');

select is((select completed_count::text from public.review_completion_for(
  'cc000000-0000-0000-0000-000000000001',
  :'publication_chapter_id'::uuid
) where subtopic_id = :'publication_subtopic_id'::uuid), '1',
  'the learner completion is current at version one');

set local role authenticated;
select set_config('pgtap.editorial_save', public.admin_save_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 'RC-P2-NEW', 1,
  jsonb_build_object(
    'subtopic_id', :'publication_subtopic_id', 'group_label', '3-1',
    'title', '新內容', 'content', '第一版教學內容',
    'requires_recompletion', false, 'sort_order', 998, 'media', '[]'::jsonb
  ), 'manual', '75000000-0000-4000-8000-000000000005')::text, true);
select set_config('pgtap.editorial_publish', public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  2, '修正標點但不改語意',
  '75000000-0000-4000-8000-000000000006', 'nonsemantic')::text, true);

select is(current_setting('pgtap.editorial_publish')::jsonb ->> 'impact',
  'compatible', 'nonsemantic typo publication is classified as compatible');
reset role;
select is((select completed_count::text from public.review_completion_for(
  'cc000000-0000-0000-0000-000000000001',
  :'publication_chapter_id'::uuid
) where subtopic_id = :'publication_subtopic_id'::uuid), '1',
  'compatible publication preserves the prior completion');

set local role authenticated;
select set_config('pgtap.semantic_save', public.admin_save_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 'RC-P2-NEW', 2,
  jsonb_build_object(
    'subtopic_id', :'publication_subtopic_id', 'group_label', '3-1',
    'title', '新內容', 'content', '第二版語意不同的教學內容',
    'requires_recompletion', false, 'sort_order', 998, 'media', '[]'::jsonb
  ), 'manual', '75000000-0000-4000-8000-000000000007')::text, true);
select set_config('pgtap.semantic_publish', public.admin_publish_content_draft(
  (current_setting('pgtap.publication_save')::jsonb #>> '{draft,draft_id}')::uuid,
  3, '更新教學語意',
  '75000000-0000-4000-8000-000000000008')::text, true);

select is(current_setting('pgtap.semantic_publish')::jsonb ->> 'impact',
  'requires_recompletion', 'semantic card publication requires recompletion');
reset role;
select is((select completed_count::text from public.review_completion_for(
  'cc000000-0000-0000-0000-000000000001',
  :'publication_chapter_id'::uuid
) where subtopic_id = :'publication_subtopic_id'::uuid), '0',
  'semantic publication lowers current completion without deleting history');
select is((select count(*)::text from public.review_progress
  where review_card_id =
    (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid),
  '1', 'historical completion rows remain unchanged');

set local role authenticated;
select set_config('pgtap.rollback', public.admin_rollback_content(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 3, 2, '恢復前一版',
  '75000000-0000-4000-8000-000000000009')::text, true);
select is(current_setting('pgtap.rollback')::jsonb ->> 'version', '4',
  'rollback creates a new version instead of moving the version pointer');

reset role;
select is((select count(*)::text from public.content_versions
  where content_type = 'review_card' and content_id =
    (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid),
  '4', 'rollback preserves every prior immutable version');
select is((select event_type from public.content_publication_events
  where request_id = '75000000-0000-4000-8000-000000000009'),
  'rollback', 'rollback appends its own event');
select throws_ok(format(
  'update public.content_versions set reason = %L where content_id = %L',
  'tampered',
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid
), '55000', 'content publication history is append-only',
  'immutable version rows reject updates');
select throws_ok(format(
  'delete from public.content_publication_events where content_id = %L',
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid
), '55000', 'content publication history is append-only',
  'immutable publication events reject deletes');

set local role authenticated;
select set_config('pgtap.history', public.admin_list_content_history(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card')::text, true);
select is(current_setting('pgtap.history')::jsonb ->> 'outcome', 'ok',
  'Admin can list safe publication history');
select ok(current_setting('pgtap.history') !~
  'frozen_payload|payload_hash|auth_session_id',
  'history projection omits frozen payloads and security internals');

select set_config('pgtap.archive', public.admin_archive_content(
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid,
  'review_card', 4, '移除目前內容',
  '75000000-0000-4000-8000-000000000010')::text, true);
select is(current_setting('pgtap.archive')::jsonb ->> 'version', '5',
  'archive creates a new immutable version');
reset role;
select is((select count(*)::text from public.review_cards where id =
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid
  and status = 'published'), '0',
  'archived content leaves the current required set');
select is((select count(*)::text from public.review_progress where review_card_id =
  (current_setting('pgtap.publication_first')::jsonb ->> 'entity_id')::uuid),
  '1', 'archive never deletes historical completion facts');

select * from finish();
rollback;
