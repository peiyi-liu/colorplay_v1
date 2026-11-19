import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';

const uuid = z.uuid();
const token = z.string().min(16).max(8192);
export const fixtureInputSchema = z.strictObject({
  api: z.string().max(100),
  anon: token,
  service: token,
});
export function parseFixtureInput(input: unknown) {
  const parsed = fixtureInputSchema.parse(input);
  const url = new URL(parsed.api);
  if (
    (parsed.api !== url.origin && parsed.api !== `${url.origin}/`) ||
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== '58321' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('FIXTURE_UNAVAILABLE');
  return { ...parsed, api: url.origin };
}
export interface FixturePorts {
  create: (email: string, password: string) => Promise<string>;
  profile: (id: string, account: string) => Promise<void>;
  login: (
    id: string,
    email: string,
    password: string,
  ) => Promise<{
    userId: string;
    accessToken: string;
    claims: { sub: string; role: string };
  }>;
  history: (accessToken: string) => Promise<{ quiz: number; review: number }>;
}
export async function createSyntheticStudents(ports: FixturePorts) {
  const rows = [];
  const seen = new Set<string>();
  for (let index = 0; index < 59; index++) {
    const account = `diag${randomBytes(7).toString('hex')}`;
    const email = `${account}@colorplay.test`;
    const password = `Aa1${randomBytes(12).toString('base64url')}`;
    const id = uuid.parse(await ports.create(email, password));
    if (seen.has(id)) throw new Error('FIXTURE_UNAVAILABLE');
    seen.add(id);
    await ports.profile(id, account);
    const session = await ports.login(id, email, password);
    if (
      session.userId !== id ||
      session.claims.sub !== id ||
      session.claims.role !== 'authenticated' ||
      !token.safeParse(session.accessToken).success
    )
      throw new Error('FIXTURE_UNAVAILABLE');
    const history = await ports.history(session.accessToken);
    if (history.quiz !== 0 || history.review !== 0)
      throw new Error('FIXTURE_UNAVAILABLE');
    rows.push(session);
  }
  return { rows, counts: { students: 59, quizHistory: 0, reviewHistory: 0 } };
}
function actualPorts(
  input: ReturnType<typeof parseFixtureInput>,
): FixturePorts {
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const service = createClient<Database>(input.api, input.service, options);
  const student = (accessToken?: string) =>
    createClient<Database>(input.api, input.anon, {
      ...options,
      ...(accessToken
        ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        : {}),
    });
  return {
    create: async (email, password) => {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || data.user.email !== email)
        throw new Error('FIXTURE_UNAVAILABLE');
      return data.user.id;
    },
    profile: async (id, account) => {
      const { data, error } = await service
        .from('profiles')
        .update({
          role: 'student',
          login_account: account,
          display_name: '本機診斷學生',
          full_name: '本機診斷學生',
        })
        .eq('id', id)
        .select('id,role,login_account')
        .single();
      if (
        error ||
        data.id !== id ||
        data.role !== 'student' ||
        data.login_account !== account
      )
        throw new Error('FIXTURE_UNAVAILABLE');
    },
    login: async (id, email, password) => {
      const client = student();
      const signed = await client.auth.signInWithPassword({ email, password });
      const verified = await client.auth.getUser();
      const accessToken = signed.data.session?.access_token;
      if (
        signed.error ||
        verified.error ||
        verified.data.user.id !== id ||
        !accessToken
      )
        throw new Error('FIXTURE_UNAVAILABLE');
      const claims: unknown = JSON.parse(
        Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString(),
      );
      const identity = z
        .object({
          sub: uuid,
          role: z.literal('authenticated'),
          exp: z.number().gt(Date.now() / 1000),
        })
        .parse(claims);
      if (identity.sub !== id) throw new Error('FIXTURE_UNAVAILABLE');
      const own = await client
        .from('profiles')
        .select('id,role')
        .eq('id', id)
        .single();
      if (own.error || own.data.id !== id || own.data.role !== 'student')
        throw new Error('FIXTURE_UNAVAILABLE');
      return {
        userId: id,
        accessToken,
        claims: { sub: id, role: 'authenticated' },
      };
    },
    history: async (accessToken) => {
      const client = student(accessToken);
      const quiz = await client
        .from('quiz_sessions')
        .select('id', { count: 'exact', head: true });
      const review = await client
        .from('review_progress')
        .select('id', { count: 'exact', head: true });
      if (
        quiz.error ||
        review.error ||
        quiz.count === null ||
        review.count === null
      )
        throw new Error('FIXTURE_UNAVAILABLE');
      return { quiz: quiz.count, review: review.count };
    },
  };
}
async function main() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > 32768) throw new Error('FIXTURE_UNAVAILABLE');
    chunks.push(bytes);
  }
  const input = parseFixtureInput(JSON.parse(Buffer.concat(chunks).toString()));
  const result = await createSyntheticStudents(actualPorts(input));
  // This stdout is a private parent-process pipe, never a public artifact.
  process.stdout.write(JSON.stringify(result));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(() => {
    process.stderr.write('FIXTURE_UNAVAILABLE\n');
    process.exitCode = 1;
  });
}
