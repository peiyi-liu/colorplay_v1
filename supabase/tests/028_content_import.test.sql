begin;

select plan(8);

select ok(not has_function_privilege(
  'authenticated', 'public.commit_content_import(jsonb,uuid,text,boolean)',
  'EXECUTE'), 'legacy Teacher import cannot bypass Content Studio drafts');
select ok(not has_function_privilege(
  'anon', 'public.commit_content_import(jsonb,uuid,text,boolean)', 'EXECUTE'),
  'anonymous clients cannot call the retired import');
select ok(has_function_privilege(
  'authenticated',
  'public.admin_begin_content_import_upload(uuid,text,text,integer)',
  'EXECUTE'), 'the unified import begin command is reachable after authorization');
select ok(has_function_privilege(
  'authenticated',
  'public.admin_preview_content_import_v2(uuid,text,text,jsonb)',
  'EXECUTE'), 'the unified dry-preview command is reachable after authorization');
select ok(has_function_privilege(
  'authenticated', 'public.admin_commit_content_import_v2(uuid,uuid,boolean)',
  'EXECUTE'), 'the unified draft-only commit is reachable after authorization');
select ok(not has_table_privilege(
  'authenticated', 'public.content_import_runs', 'SELECT'),
  'browser clients cannot read normalized import receipts');
select ok(not has_table_privilege(
  'authenticated', 'public.content_import_upload_runs', 'SELECT'),
  'browser clients cannot read quarantine upload receipts');
select ok(not has_table_privilege(
  'authenticated', 'public.content_imports', 'INSERT,UPDATE,DELETE'),
  'legacy import reports remain non-writable from browsers');

select * from finish();

rollback;
