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
  columns?: {
    class?: unknown;
    mask_strategy?: unknown;
    name?: unknown;
  }[];
  export: unknown;
  resource: string;
}

interface Catalog {
  resources: CatalogResource[];
}

const REBASELINE_COLUMNS = [
  'classroom_join_rate_limits.failure_count',
  'classroom_join_rate_limits.scope',
  'classroom_join_rate_limits.subject_hash',
  'classroom_join_rate_limits.updated_at',
  'classroom_join_rate_limits.window_started_at',
  'course_progression_settings.course_id',
  'course_progression_settings.mode',
  'course_progression_settings.rules_version',
  'course_progression_settings.updated_at',
  'live_session_questions.chapter_id',
  'live_session_questions.section_id',
  'questions.bank_kind',
  'quiz_sessions.abandoned_at',
  'quiz_sessions.classroom_id',
  'quiz_templates.section_id',
  'student_chapter_unlocks.chapter_id',
  'student_chapter_unlocks.rules_version',
  'student_chapter_unlocks.source_chapter_id',
  'student_chapter_unlocks.unlocked_at',
  'student_chapter_unlocks.user_id',
  'student_registration_claims.created_at',
  'student_registration_claims.lease_expires_at',
  'student_registration_claims.lease_token',
  'student_registration_claims.state',
  'student_registration_claims.updated_at',
  'student_registration_claims.user_id',
] as const;

describe('phase 1 admin sensitivity catalog contract', () => {
  it('regenerates byte-identically from the spec', () => {
    execFileSync(process.execPath, [
      'scripts/admin/generate-sensitivity-catalog.mjs',
      '--check',
    ]);
  });
  it('holds 46 existing + 9 control + 4 quarantined resources, all export=false', async () => {
    const catalog = JSON.parse(
      await readFile('supabase/catalog/admin-sensitivity-catalog.json', 'utf8'),
    ) as Catalog;
    expect(catalog.resources).toHaveLength(59);
    expect(
      catalog.resources.filter((r) => r.resource.startsWith('admin_')),
    ).toHaveLength(9);
    expect(catalog.resources.every((r) => r.export === false)).toBe(true);
    const names = catalog.resources.map((r) => r.resource);
    expect(names).toContain('external_activities'); // spec §9.1 曾遺漏,防回歸
    expect(names).not.toContain('audit_logs'); // spec §9.1:不存在的表不得入 catalog
    const profiles = catalog.resources.find((r) => r.resource === 'profiles');
    expect(profiles?.columns).toContainEqual(
      expect.objectContaining({
        class: 'personal',
        mask_strategy: 'email_mask',
        name: 'contact_email',
      }),
    );
  });

  it('quarantines every rebaseline column without adding a browser surface', async () => {
    const catalog = JSON.parse(
      await readFile('supabase/catalog/admin-sensitivity-catalog.json', 'utf8'),
    ) as {
      resources: {
        columns: {
          class: unknown;
          filterable: unknown;
          mask_strategy: unknown;
          name: string;
          searchable: unknown;
          sortable: unknown;
        }[];
        export: unknown;
        resource: string;
        surface: string;
      }[];
    };
    const byKey = new Map(
      catalog.resources.flatMap((resource) =>
        resource.columns.map((column) => [
          `${resource.resource}.${column.name}`,
          { column, resource },
        ]),
      ),
    );

    expect(
      REBASELINE_COLUMNS.map((key) => ({
        class: byKey.get(key)?.column.class,
        filterable: byKey.get(key)?.column.filterable,
        key,
        mask_strategy: byKey.get(key)?.column.mask_strategy,
        searchable: byKey.get(key)?.column.searchable,
        sortable: byKey.get(key)?.column.sortable,
      })),
    ).toEqual(
      REBASELINE_COLUMNS.map((key) => ({
        class: 'forbidden',
        filterable: false,
        key,
        mask_strategy: null,
        searchable: false,
        sortable: false,
      })),
    );
    expect(
      [
        'classroom_join_rate_limits',
        'course_progression_settings',
        'student_chapter_unlocks',
        'student_registration_claims',
      ].map((name) => {
        const resource = catalog.resources.find(
          (candidate) => candidate.resource === name,
        );
        return {
          export: resource?.export,
          resource: name,
          surface: resource?.surface,
        };
      }),
    ).toEqual([
      {
        export: false,
        resource: 'classroom_join_rate_limits',
        surface: 'none',
      },
      {
        export: false,
        resource: 'course_progression_settings',
        surface: 'none',
      },
      {
        export: false,
        resource: 'student_chapter_unlocks',
        surface: 'none',
      },
      {
        export: false,
        resource: 'student_registration_claims',
        surface: 'none',
      },
    ]);
  });
});
