import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import ts from 'typescript';
import {
  ACCOUNT_PATTERN,
  normalizeAccount,
} from '../../../supabase/functions/_shared/account';
import { readRuntimeSupabaseApiKeys } from '../../../supabase/functions/_shared/api-keys';
import {
  ALLOWED_ORIGINS,
  corsHeaders,
  jsonResponse,
} from '../../../supabase/functions/_shared/cors';

// Execute the original production handler body. Only its import declarations
// are removed; actual pure dependencies and controlled Deno/SDK ports replace
// the Edge loader. No fetch, browser, service, credentials or fixture is used.
export const loadAuthRecoverHandler = () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/auth-recover/index.ts'),
    'utf8',
  );
  const parsed = ts.createSourceFile(
    'auth-recover-index.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const body = ts.createPrinter().printFile(
    ts.factory.updateSourceFile(
      parsed,
      parsed.statements.filter(
        (statement) => !ts.isImportDeclaration(statement),
      ),
    ),
  );
  const emitted = ts.transpileModule(body, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const targets: string[] = [];
  const captured: { handler?: (request: Request) => Promise<Response> } = {};
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { id: '18400000-0000-0000-0000-000000000001' },
              error: null,
            }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: { user: { email: 'synthetic@colorplay.test' } },
            error: null,
          }),
      },
      resetPasswordForEmail: (
        _email: string,
        options: { redirectTo: string },
      ) => {
        targets.push(options.redirectTo);
        return Promise.resolve({ data: {}, error: null });
      },
    },
  };
  const environment: Record<string, string> = {
    SUPABASE_URL: 'http://127.0.0.1:58321',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: 'SYNTHETIC_PUBLISHABLE',
    }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'SYNTHETIC_SECRET' }),
  };
  new Script(emitted, {
    filename: 'auth-recover-production-handler.js',
  }).runInNewContext(
    {
      exports: {},
      Request,
      Response,
      URL,
      ACCOUNT_PATTERN,
      normalizeAccount,
      readRuntimeSupabaseApiKeys,
      ALLOWED_ORIGINS,
      corsHeaders,
      jsonResponse,
      createClient: () => client,
      Deno: {
        env: { get: (name: string) => environment[name] },
        serve: (value: unknown) => {
          if (typeof value !== 'function') throw Error('HANDLER_SETUP_INVALID');
          captured.handler = value as (request: Request) => Promise<Response>;
        },
      },
    },
    { timeout: 1000 },
  );
  const handler = captured.handler;
  if (!handler) throw Error('HANDLER_SETUP_INVALID');
  return {
    handle: (request: Request) => handler(request),
    targets,
  };
};
