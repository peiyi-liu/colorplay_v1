// 開發後台：建立教師帳號（owner 規則——教師不開放自助註冊）。
// 用法：
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/admin/create-teacher.mjs \
//     --email teacher@example.com --password 'Abc123' --account teacher01 \
//     --name '王小明' [--classroom '一年甲班']
// 密碼需符合政策：6–12 碼、含大小寫。--classroom 會以該教師身分建立班級並印出班級序號。

import console from 'node:console';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const readArgs = () => {
  const args = {};
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`INVALID_ARGUMENT: ${key ?? '(empty)'}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
};

const main = async () => {
  const { account, classroom, email, name, password } = readArgs();
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('ADMIN_ENV_MISSING');
  if (!email || !password || !account || !name) {
    throw new Error('USAGE: --email --password --account --name [--classroom]');
  }
  const normalizedAccount = account.trim().toLowerCase();
  if (!/^[a-z0-9]{3,20}$/.test(normalizedAccount)) {
    throw new Error('ACCOUNT_FORMAT_INVALID (3–20 碼英數字)');
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])\S{6,12}$/.test(password)) {
    throw new Error('PASSWORD_POLICY_VIOLATION (6–12 碼、含大小寫)');
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 既有 Email 直接更新（重跑安全）；否則建立新帳號。
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
  let userId = created?.user?.id;
  if (createError) {
    const { data: page, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listError) throw new Error('ADMIN_LIST_USERS_FAILED');
    const existing = page.users.find((user) => user.email === email);
    if (!existing) {
      throw new Error(`ADMIN_CREATE_FAILED: ${createError.message}`);
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(
      existing.id,
      { email_confirm: true, password },
    );
    if (updateError) throw new Error('ADMIN_UPDATE_FAILED');
    userId = existing.id;
  }
  if (!userId) throw new Error('ADMIN_CREATE_FAILED');

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: name,
      login_account: normalizedAccount,
      role: 'teacher',
    })
    .eq('id', userId);
  if (profileError) {
    throw new Error(`PROFILE_UPDATE_FAILED: ${profileError.message}`);
  }

  let joinCode = null;
  if (classroom) {
    const teacherClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await teacherClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw new Error('TEACHER_SIGN_IN_FAILED');
    const { data: receipt, error: classroomError } = await teacherClient.rpc(
      'create_classroom',
      { p_name: classroom },
    );
    await teacherClient.auth.signOut({ scope: 'local' });
    if (classroomError) {
      throw new Error(`CLASSROOM_CREATE_FAILED: ${classroomError.message}`);
    }
    joinCode = receipt?.[0]?.join_code ?? null;
  }

  console.log(
    JSON.stringify(
      {
        account: normalizedAccount,
        classroom: classroom ?? null,
        email,
        joinCode,
        userId,
      },
      null,
      2,
    ),
  );
};

await main();
