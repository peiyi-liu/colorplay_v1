import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('requires exact-artifact authentication proof before assigning the Staging alias', async () => {
  const workflow = await readFile(
    '.github/workflows/staging-deploy.yml',
    'utf8',
  );
  const deploy = workflow.indexOf('pnpm exec vercel deploy --prebuilt');
  const functions = workflow.indexOf('pnpm exec supabase functions deploy');
  const proof = workflow.indexOf(
    'pnpm exec tsx scripts/release/staging-artifact-auth.ts',
  );
  const alias = workflow.indexOf('pnpm exec vercel alias set');
  expect(deploy).toBeGreaterThan(0);
  expect(functions).toBeGreaterThan(deploy);
  expect(proof).toBeGreaterThan(functions);
  expect(alias).toBeGreaterThan(proof);
  expect(workflow).toContain('STAGING_AUTH_EXPECTED_SHA: ${{ github.sha }}');
  expect(workflow.slice(proof, alias)).not.toContain('continue-on-error');
  expect(workflow.slice(proof, alias)).not.toContain('always()');
});
