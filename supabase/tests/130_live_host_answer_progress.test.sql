begin;
select no_plan();

-- Transaction-local identities; no service credential or external Auth dependency.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
)
select '00000000-0000-0000-0000-000000000000'::uuid,
  ('13000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  'authenticated','authenticated','m82-'||i||'@colorplay.test',
  crypt('LocalOnly-M82!',gen_salt('bf')),now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','',''
from generate_series(1,5) i;
update public.profiles set role='teacher'
where id in ('13000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000005');
insert into public.classrooms(id,owner_teacher_id,name,join_code_hash,join_code_version,join_code_rotated_at,status)
values ('13100000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','M82 transport',decode(repeat('ab',32),'hex'),1,now(),'active');
insert into public.classroom_members(classroom_id,user_id,member_role,status,joined_at,activated_at,last_join_request_id)
select '13100000-0000-0000-0000-000000000001'::uuid,
  ('13000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  case when i=1 then 'teacher' else 'student' end::public.classroom_member_role,
  'active',now(),now(),('13200000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid
from generate_series(1,4) i;
create function pg_temp.as_user(i integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
$$;
set local role authenticated;
select pg_temp.as_user(1);
select set_config('test.activity',public.create_live_activity('M82','4f208855-dfc8-6cc5-7671-02dfacba85d1',20,'device')::text,true);
select set_config('test.created',public.create_live_session((current_setting('test.activity')::jsonb->>'activity_id')::uuid,'13100000-0000-0000-0000-000000000001',null)::text,true);
select set_config('test.sid',current_setting('test.created')::jsonb->>'session_id',true);
select set_config('test.shared','live-session:'||current_setting('test.sid'),true);
select set_config('test.progress','live-host-progress:'||current_setting('test.sid'),true);
select set_config('test.started',public.start_live_session(current_setting('test.sid')::uuid,1)::text,true);
select pg_temp.as_user(2);
select public.join_live_session(current_setting('test.created')::jsonb->>'join_code','13300000-0000-0000-0000-000000000002');
select pg_temp.as_user(3);
select public.join_live_session(current_setting('test.created')::jsonb->>'join_code','13300000-0000-0000-0000-000000000003');
select pg_temp.as_user(4);
select public.join_live_session(current_setting('test.created')::jsonb->>'join_code','13300000-0000-0000-0000-000000000004');
select pg_temp.as_user(1);
select set_config('test.opened',public.open_live_question(current_setting('test.sid')::uuid,(current_setting('test.started')::jsonb->>'state_version')::integer)::text,true);
reset role;
select set_config('test.qid',id::text,true),set_config('test.option',public_options->0->>'id',true)
from public.live_session_questions where session_id=current_setting('test.sid')::uuid and position=1;
select is((select count(*)::int from realtime.messages where topic=current_setting('test.shared') and payload ? 'joined_display_name'),3,'all three roster messages remain shared');
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),0,'phase transitions do not become Host progress');
set local role authenticated;
select pg_temp.as_user(2);
select set_config('test.receipt',public.submit_live_answer(current_setting('test.qid')::uuid,current_setting('test.option')::uuid,'13400000-0000-0000-0000-000000000002')::text,true);
select is(public.submit_live_answer(current_setting('test.qid')::uuid,current_setting('test.option')::uuid,'13400000-0000-0000-0000-000000000002'),current_setting('test.receipt')::jsonb,'idempotent normal answer keeps original receipt');
reset role;
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),1,'normal answer emits exactly one Host progress');
select is((select (payload->>'answered_count')::int from realtime.messages where topic=current_setting('test.progress')),1,'normal answered count remains correct');
select is((select count(*)::int from realtime.messages where topic=current_setting('test.shared') and payload ? 'answered_count'),0,'shared receives no mid-question answer progress');
update public.live_session_questions set deadline_at=clock_timestamp()-interval '1 second' where id=current_setting('test.qid')::uuid;
set local role authenticated;
select pg_temp.as_user(3);
select public.submit_live_answer(current_setting('test.qid')::uuid,current_setting('test.option')::uuid,'13400000-0000-0000-0000-000000000003');
reset role;
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),2,'timeout answer emits one progress');
select is((select answer_status::text from public.live_answers where session_question_id=current_setting('test.qid')::uuid and idempotency_key='13400000-0000-0000-0000-000000000003'),'timeout','deadline decision remains authoritative');
select is((select state::text from public.live_sessions where id=current_setting('test.sid')::uuid),'question_open','not all participants answered yet');
set local role authenticated;
select pg_temp.as_user(4);
select public.submit_live_answer(current_setting('test.qid')::uuid,current_setting('test.option')::uuid,'13400000-0000-0000-0000-000000000004');
reset role;
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),3,'last timeout still emits one progress');
select is((select count(*)::int from realtime.messages where topic=current_setting('test.shared') and payload->>'state'='question_feedback'),1,'automatic close still emits exactly one shared feedback');
select ok((select bool_and(private and extension='broadcast') from realtime.messages where topic=current_setting('test.progress')),'all Host progress is private broadcast');
select ok((select bool_and((select array_agg(k order by k) from jsonb_object_keys(payload) k)=array['answered_count','id','session_id','state','state_version']) from realtime.messages where topic=current_setting('test.progress')),'progress has exactly four business fields plus generated transport id');
select ok((select bool_and(jsonb_typeof(payload->'id')='string' and length(payload->>'id')=36 and (payload->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' and payload->>'id'=id::text) from realtime.messages where topic=current_setting('test.progress')),'every generated transport UUID matches its message row id');
select ok((select bool_and(payload->>'session_id'=current_setting('test.sid') and payload->>'state'='question_open' and (payload->>'state_version')::int=(current_setting('test.opened')::jsonb->>'state_version')::int and jsonb_typeof(payload->'answered_count')='number') from realtime.messages where topic=current_setting('test.progress')),'normal and timeout progress preserve all business bindings');
select is((select array_agg((payload->>'answered_count')::int order by (payload->>'answered_count')::int) from realtime.messages where topic=current_setting('test.progress')),array[1,2,3],'normal and timeout answered counts advance exactly once per original answer');
select ok(not has_function_privilege('authenticated','live_private.broadcast_answer_progress(uuid,jsonb)','execute'),'authenticated cannot call private sender');
select ok(not has_function_privilege('anon','live_private.broadcast_answer_progress(uuid,jsonb)','execute'),'anon cannot call private sender');
set local role authenticated;
select pg_temp.as_user(1);
select is(live_private.host_progress_session_id(current_setting('test.progress')),current_setting('test.sid')::uuid,'strict canonical parser');
select is(live_private.host_progress_session_id(topic),null::uuid,'malformed/prefix/suffix topic rejected: '||label)
from (values ('missing','live-host-progress:'),('uuid','live-host-progress:not-a-uuid'),('suffix',current_setting('test.progress')||':extra'),('prefix','x'||current_setting('test.progress')),('shared',current_setting('test.shared'))) t(label,topic);
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),3,'owning Host can receive');
select is((select count(*)::int from realtime.messages where topic=current_setting('test.shared')),6,'Host still receives shared start/roster/open/feedback');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values(current_setting('test.progress'),'broadcast','{}','live_state',true)$$,'42501',null,'even owning Host cannot send progress');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values(current_setting('test.progress'),'presence','{}','presence',true)$$,'42501',null,'owning Host cannot publish progress presence');
select pg_temp.as_user(2);
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),0,'student receives no progress');
select ok((select count(*) from realtime.messages where topic=current_setting('test.shared'))>0,'student keeps shared visibility');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values(current_setting('test.progress'),'broadcast','{}','live_state',true)$$,'42501',null,'student cannot send progress');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values(current_setting('test.progress'),'presence','{}','presence',true)$$,'42501',null,'student cannot publish progress presence');
select pg_temp.as_user(5);
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),0,'other Host/outsider receives no progress');
reset role;
set local role anon;
select is((select count(*)::int from realtime.messages where topic=current_setting('test.progress')),0,'anon receives no progress');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values(current_setting('test.progress'),'broadcast','{}','live_state',true)$$,'42501',null,'anon cannot send progress');
reset role;
select * from finish();
rollback;
