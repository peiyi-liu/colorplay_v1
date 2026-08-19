// tests/contracts/phase1-admin-catalog.test.ts
// 生成器決定性與 fail-closed:--check 乾淨、46+9、personal 必有遮罩、
// 全表 export=false、未知資源不在 catalog(以合成名抽查)。
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// export 刻意標成 unknown,不是 boolean:JSON.parse 的結果沒有 runtime
// validation,`as Catalog` 只是 compile-time 斷言——若 catalog 裡某個
// resource 的 export 缺失/為 null/0/''這類非 boolean 的假值,型別若標
// boolean 會讓下面 `r.export === false` 被 eslint 判定「已知是 boolean，
// 跟 false 比較是多餘的」而要求改成 `!r.export`,但那樣任何非 boolean 假值
// 也會被判成「符合」,削弱了這條 fail-closed 契約(Task 15 review Finding 4)。
interface CatalogResource {
  export: unknown;
  resource: string;
}

interface Catalog {
  resources: CatalogResource[];
}

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
    ) as Catalog;
    expect(catalog.resources).toHaveLength(55);
    expect(
      catalog.resources.filter((r) => r.resource.startsWith('admin_')),
    ).toHaveLength(9);
    expect(catalog.resources.every((r) => r.export === false)).toBe(true);
    const names = catalog.resources.map((r) => r.resource);
    expect(names).toContain('external_activities'); // spec §9.1 曾遺漏,防回歸
    expect(names).not.toContain('audit_logs'); // spec §9.1:不存在的表不得入 catalog
  });
});
