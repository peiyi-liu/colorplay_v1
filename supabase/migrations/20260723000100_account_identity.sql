-- 帳號制認證（ADR 0003 定案版）：profiles 增加「名字」與「登入帳號（學號）」。
-- 未新增任何 authenticated 欄位授權——profiles 既有 column-level grant 僅允許
-- authenticated 更新 display_name/timezone/reduced_motion，故兩個新欄位只有
-- service role（Edge Function／管理腳本）能寫入。

alter table public.profiles
  add column full_name text
    check (full_name is null or char_length(btrim(full_name)) between 1 and 40),
  add column login_account text
    check (login_account is null or login_account ~ '^[a-z0-9]{3,20}$');

create unique index profiles_login_account_key
  on public.profiles (login_account)
  where login_account is not null;

-- 沿用 20260714000100 的欄位級授權慣例：service role（Edge Function
-- student-register、seed／管理腳本）需要寫入帳號欄位與註冊時的暱稱。
grant update (display_name, full_name, login_account)
  on public.profiles to service_role;

-- Edge Functions 的最小讀取面：
-- auth-login（教師班級序號雜湊比對）與 student-register（班級序號→班級、
-- 既有成員檢查）。僅授與必要欄位，不開放整表。
grant select (id, status, join_code_hash, owner_teacher_id)
  on public.classrooms to service_role;
grant select (classroom_id, user_id)
  on public.classroom_members to service_role;
