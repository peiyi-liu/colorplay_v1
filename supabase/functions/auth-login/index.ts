import { createClient } from 'npm:@supabase/supabase-js@2';

import { readRuntimeSupabaseApiKeys } from '../_shared/api-keys.ts';
import { createAuthLoginAdmin } from './client-factory.ts';
import { createAuthLoginHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const { publishableKey, secretKey } = readRuntimeSupabaseApiKeys((name) =>
  Deno.env.get(name),
);

Deno.serve(
  createAuthLoginHandler({
    supabaseUrl,
    publishableKey,
    createAdmin: (fetcher) => {
      const client = createClient(supabaseUrl, secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: fetcher },
      });
      return createAuthLoginAdmin(
        client.from('profiles').select('id, role'),
        (id) => client.auth.admin.getUserById(id),
      );
    },
  }),
);
