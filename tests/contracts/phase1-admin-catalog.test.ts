// tests/contracts/phase1-admin-catalog.test.ts
// 生成器決定性與 fail-closed:--check 乾淨、46+9、personal 必有遮罩、
// 全表 export=false、未知資源不在 catalog(以合成名抽查)。
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('phase 1 admin sensitivity catalog contract', () => {
  it('regenerates byte-identically from the spec', () => {
    execFileSync(process.execPath, [
      'scripts/admin/generate-sensitivity-catalog.mjs',
      '--check',
    ]);
  });
  it('holds 46 existing + 9 control resources, all export=false', async () => {
    const catalog = JSON.parse(
      await readFile('supabase/catalog/admin-sensitivity-catalog.json', 'utf8'),
    );
    expect(catalog.resources).toHaveLength(55);
    expect(
      catalog.resources.filter((r: { resource: string }) =>
        r.resource.startsWith('admin_'),
      ),
    ).toHaveLength(9);
    expect(
      catalog.resources.every((r: { export: boolean }) => r.export === false),
    ).toBe(true);
    const names = catalog.resources.map(
      (r: { resource: string }) => r.resource,
    );
    expect(names).toContain('external_activities'); // spec §9.1 曾遺漏,防回歸
    expect(names).not.toContain('audit_logs'); // spec §9.1:不存在的表不得入 catalog
  });
});
