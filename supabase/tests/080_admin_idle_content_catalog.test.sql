begin;

set local search_path = public, extensions;
select plan(11);

select has_function('public', 'admin_touch_session_activity', array[]::text[],
  'admin activity touch RPC exists');
select ok(has_function_privilege(
  'authenticated', 'public.admin_touch_session_activity()', 'EXECUTE'),
  'authenticated admin may reach the authorized activity touch RPC');
select ok(not has_function_privilege(
  'anon', 'public.admin_touch_session_activity()', 'EXECUTE'),
  'anonymous caller cannot touch an admin session');
select has_function('public', 'admin_list_content_catalog', array[]::text[],
  'generic content hierarchy catalog exists');
select ok(has_function_privilege(
  'authenticated', 'public.admin_list_content_catalog()', 'EXECUTE'),
  'authenticated admin may reach the authorized content catalog');
select has_function('public', 'admin_delete_content_draft',
  array['uuid','integer','uuid'], 'draft deletion RPC exists');
select ok(not has_function_privilege(
  'anon', 'public.admin_delete_content_draft(uuid,integer,uuid)', 'EXECUTE'),
  'anonymous caller cannot delete drafts');
select ok(has_function_privilege(
  'authenticated', 'public.admin_delete_content_draft(uuid,integer,uuid)',
  'EXECUTE'), 'authenticated admin may reach authorized draft deletion');
select matches(pg_get_functiondef(
  'public.admin_internal_authorize()'::regprocedure), '20 minutes',
  'server authorization uses the 20-minute idle window');
select ok(position(
  'if (v_auth ->> ''mfa_age_seconds'')::integer > 300 then' in
  pg_get_functiondef(
    'public.admin_save_content_draft(uuid,uuid,text,text,integer,jsonb,text,uuid)'::regprocedure)
  ) = 0,
  'ordinary draft saves no longer demand five-minute fresh MFA');
select is((select relrowsecurity::text from pg_class
  where oid = 'public.content_draft_deletion_requests'::regclass), 'true',
  'draft deletion receipts are protected by RLS');

select * from finish();
rollback;
