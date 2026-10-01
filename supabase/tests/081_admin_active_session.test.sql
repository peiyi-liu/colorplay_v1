begin;
set local search_path = public, extensions;
select plan(13);
\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();
select id as test_card from public.review_cards where stable_code='RC3101' limit 1 \gset
select id as test_subtopic from public.subtopics where stable_code='sheet-3-1-all' limit 1 \gset
update public.admin_sessions set last_totp_verified_at=now()-interval '2 hours',
  last_activity_at=now() where admin_user_id='aa000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','aa000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.session_id','aa000000-0000-0000-0000-0000000000e1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is(public.admin_list_content_history(:'test_card','review_card')->>'outcome','ok',
  'active Admin can read history two hours after MFA');
select is(public.admin_preview_content_archive(:'test_card','review_card',1)->>'outcome','ok',
  'active Admin can preview archive without another MFA challenge');
select set_config('pgtap.active_draft',public.admin_save_content_draft(null,null,'review_card',
 'RC-ACTIVE-TEST',0,jsonb_build_object('subtopic_id',:'test_subtopic','title','測試草稿',
 'content','測試內容','group_label','3-1','sort_order',999,'media','[]'::jsonb),
 'manual','81000000-0000-4000-8000-000000000001')::text,true);
select is(public.admin_preview_content_publication(
 (current_setting('pgtap.active_draft')::jsonb #>> '{draft,draft_id}')::uuid,1)->>'outcome','ok',
 'active Admin can preview publication two hours after MFA');
select is((select entry->>'title' from jsonb_array_elements(public.admin_list_content_catalog()->'drafts') entry
 where entry->>'stable_code'='RC-ACTIVE-TEST'),'測試草稿',
 'pending queue includes real draft title without first opening an editor');
select set_config('pgtap.active_published',public.admin_publish_content_draft(
 (current_setting('pgtap.active_draft')::jsonb #>> '{draft,draft_id}')::uuid,1,
 '驗證活躍管理員發布內容','81000000-0000-4000-8000-000000000003')::text,true);
select is(current_setting('pgtap.active_published')::jsonb->>'outcome','ok',
 'active Admin actually publishes without elapsed MFA restriction');
select is((select count(*)::integer from jsonb_array_elements(public.admin_list_content_catalog()->'drafts') entry
 where entry->>'stable_code'='RC-ACTIVE-TEST'),0,
 'published working copy disappears from pending queue');
select is(public.admin_list_content_history(
 (current_setting('pgtap.active_published')::jsonb->>'entity_id')::uuid,'review_card')
 #>> '{entries,0,payload,content}','測試內容',
 'history reads the immutable version content, not only event metadata');
select set_config('pgtap.active_draft',public.admin_save_content_draft(
 (current_setting('pgtap.active_draft')::jsonb #>> '{draft,draft_id}')::uuid,
 (current_setting('pgtap.active_published')::jsonb->>'entity_id')::uuid,
 'review_card','RC-ACTIVE-TEST',1,jsonb_build_object('subtopic_id',:'test_subtopic',
 'title','更新草稿標題','content','測試內容','group_label','3-1','sort_order',999,'media','[]'::jsonb),
 'manual','81000000-0000-4000-8000-000000000004')::text,true);
select is((select entry->>'title' from jsonb_array_elements(public.admin_list_content_catalog()->'drafts') entry
 where entry->>'stable_code'='RC-ACTIVE-TEST'),'更新草稿標題',
 'editing a published copy puts its changed draft back in the pending queue');
select is(public.admin_delete_content_draft(
 (current_setting('pgtap.active_draft')::jsonb #>> '{draft,draft_id}')::uuid,2,
 '81000000-0000-4000-8000-000000000002')->>'outcome','ok',
 'active Admin can delete a draft without another MFA challenge');
select is(jsonb_typeof(public.admin_list_content_catalog()->'drafts'),'array',
 'catalog returns the global pending-draft queue');
reset role;
update public.admin_sessions set last_activity_at=now()-interval '20 minutes'
 where admin_user_id='aa000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.admin_list_content_history(:'test_card','review_card')->>'code',
 'STALE_PRIVILEGED_SESSION','server rejects exactly twenty minutes of inactivity');
select is(public.admin_touch_session_activity()->>'code','STALE_PRIVILEGED_SESSION',
 'activity cannot revive an expired privileged session');
reset role;
select set_config('request.jwt.claim.sub','cc000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.session_id','cc000000-0000-0000-0000-0000000000e3',true);
set local role authenticated;
select is(public.admin_list_content_catalog()->>'code','STALE_PRIVILEGED_SESSION',
 'Student still cannot read the authoring catalog');
select * from finish();
rollback;
