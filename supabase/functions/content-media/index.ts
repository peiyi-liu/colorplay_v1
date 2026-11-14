import { createClient } from 'npm:@supabase/supabase-js@2.110.2';

import { readRuntimeSupabaseApiKeys } from '../_shared/api-keys.ts';
import { createContentMediaHandler } from './handler.ts';
import {
  ContentMediaProcessorError,
  processContentMedia,
} from './processor.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
let publishableKey = '';
let secretKey = '';
let credentialsInvalid = false;
try {
  ({ publishableKey, secretKey } = readRuntimeSupabaseApiKeys((name) =>
    Deno.env.get(name),
  ));
} catch {
  credentialsInvalid = true;
}

Deno.serve(
  createContentMediaHandler({
    credentialsInvalid,
    clients: (authorization) => ({
      user: createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authorization } },
      }),
      service: createClient(supabaseUrl, secretKey, {
        auth: { persistSession: false },
      }),
    }),
    process: processContentMedia,
    processorFailure: (error) =>
      error instanceof ContentMediaProcessorError ? error.code : null,
  }),
);
