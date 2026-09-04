begin;

select plan(15);

select has_table(
  'public',
  'student_registration_claims',
  'registration claims table exists'
);
select is(
  (
    select relation.relrowsecurity
    from pg_class as relation
    where relation.oid = 'public.student_registration_claims'::regclass
  ),
  true,
  'registration claims enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.student_registration_claims',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot access claim rows directly'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.student_registration_claims',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service role cannot bypass claim commands'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.claim_student_registration(uuid)',
    'EXECUTE'
  ),
  'authenticated students may claim their registration operation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_student_registration(uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot claim registration'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '59000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'claim.student.a@colorplay.test',
    crypt('LocalOnly-Claim1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '59000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'claim.student.b@colorplay.test',
    crypt('LocalOnly-Claim2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '59000000-0000-0000-0000-000000000001',
  true
);

select is(
  public.claim_student_registration(
    '59100000-0000-0000-0000-000000000001'
  ),
  'ACQUIRED',
  'the first request acquires the registration lease'
);
select is(
  public.claim_student_registration(
    '59100000-0000-0000-0000-000000000002'
  ),
  'IN_PROGRESS',
  'a concurrent request cannot acquire the same user lease'
);
select is(
  public.release_student_registration_claim(
    '59100000-0000-0000-0000-000000000001'
  ),
  true,
  'the lease owner may release a failed operation'
);
select is(
  public.claim_student_registration(
    '59100000-0000-0000-0000-000000000002'
  ),
  'ACQUIRED',
  'a retry acquires a released lease'
);
select throws_ok(
  $$select public.complete_student_registration_claim(
      '59100000-0000-0000-0000-000000000002'
    )$$,
  'P0001',
  'REGISTRATION_CLAIM_LOST',
  'a claim cannot complete before the profile account is committed'
);

reset role;
update public.profiles
set login_account = 'claimstudent1'
where id = '59000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '59000000-0000-0000-0000-000000000001',
  true
);
select lives_ok(
  $$select public.complete_student_registration_claim(
      '59100000-0000-0000-0000-000000000002'
    )$$,
  'the lease owner completes after the profile account is committed'
);
select is(
  public.claim_student_registration(
    '59100000-0000-0000-0000-000000000003'
  ),
  'COMPLETED',
  'completed registration cannot be reopened'
);

select set_config(
  'request.jwt.claim.sub',
  '59000000-0000-0000-0000-000000000002',
  true
);
select is(
  public.claim_student_registration(
    '59100000-0000-0000-0000-000000000004'
  ),
  'ACQUIRED',
  'another student has an independent registration lease'
);
select throws_ok(
  $$select * from public.student_registration_claims$$,
  '42501',
  null,
  'authenticated callers cannot inspect claim rows'
);

select * from finish();

rollback;
