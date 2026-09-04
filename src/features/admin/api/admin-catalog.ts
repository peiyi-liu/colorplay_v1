// Build-time 匯入 machine-generated sensitivity catalog 的**瀏覽器子集**
// (spec §9;Task 4 產出 + CI drift 強制)。
//
// 刻意不直接讀整份 JSON:那會把全部控制表與 forbidden 欄名打進一個公開可取
// 的靜態 chunk(route guard 保護不了 /assets/*.js),違反 spec §3.3「無 schema
// 洩漏」。改由 scripts/vite/admin-browser-catalog.ts 在 build time 濾成
// browser surface + 非 forbidden 欄,單一事實來源仍是同一份 JSON。
//
// **這份資料只決定 UI 選項渲染**(要顯示哪些欄、哪些欄可 filter/sort、哪些
// 欄是 personal 需要遮罩與「揭露」入口)。授權與投影的權威一律在 PostgreSQL
// RPC 自己的 catalog 查詢(AGENTS.md §5、spec §7):前端就算被竄改成把
// forbidden 欄排進 filter,server 仍會回 COLUMN_NOT_ALLOWED。
import browserCatalog from 'virtual:admin-browser-catalog';

export type AdminCatalogClass = 'open' | 'internal' | 'personal' | 'forbidden';

export interface AdminCatalogColumn {
  class: AdminCatalogClass;
  filterable: boolean;
  mask_strategy: string | null;
  name: string;
  searchable: boolean;
  sortable: boolean;
}

export interface AdminCatalogResource {
  columns: readonly AdminCatalogColumn[];
  domain: string;
  export: boolean;
  resource: string;
  surface: string;
}

const catalog = browserCatalog as {
  resources: readonly AdminCatalogResource[];
};

/** 給測試用:client bundle 實際看得到的全部資源(已是過濾後的子集)。 */
export function allClientCatalogResources(): readonly AdminCatalogResource[] {
  return catalog.resources;
}

export interface AdminBrowserCatalogGroup {
  domain: string;
  resources: readonly string[];
}

/** Browser-only navigation derived from the same safe client catalog. */
export function browserCatalogGroups(): readonly AdminBrowserCatalogGroup[] {
  const grouped = new Map<string, string[]>();
  for (const entry of catalog.resources) {
    if (entry.surface !== 'browser') continue;
    const resources = grouped.get(entry.domain) ?? [];
    resources.push(entry.resource);
    grouped.set(entry.domain, resources);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, resources]) => ({
      domain,
      resources: [...resources].sort((left, right) =>
        left.localeCompare(right),
      ),
    }));
}

/**
 * 只回傳 `surface='browser'` 的資源。控制表(admin_sessions、
 * admin_audit_events…)在 catalog 裡是 access/audit/health/none surface,
 * 不是 generic safe-browser resource(spec §9.4),因此永遠查不到。
 */
export function findBrowserResource(
  domain: string,
  resource: string,
): AdminCatalogResource | null {
  return (
    catalog.resources.find(
      (entry) =>
        entry.domain === domain &&
        entry.resource === resource &&
        entry.surface === 'browser',
    ) ?? null
  );
}

/** list/detail 會投影的欄位;`forbidden` 永不出現(spec §9.2)。 */
export function browserProjectionColumns(
  resource: AdminCatalogResource | null,
): readonly AdminCatalogColumn[] {
  if (!resource) return [];
  return resource.columns.filter((column) => column.class !== 'forbidden');
}

export function filterableColumns(
  resource: AdminCatalogResource | null,
): readonly AdminCatalogColumn[] {
  if (!resource) return [];
  return resource.columns.filter(
    (column) => column.filterable && column.class !== 'forbidden',
  );
}

export function sortableColumns(
  resource: AdminCatalogResource | null,
): readonly AdminCatalogColumn[] {
  if (!resource) return [];
  return resource.columns.filter(
    (column) => column.sortable && column.class !== 'forbidden',
  );
}

/** 需要固定遮罩、且是唯一可經 `admin_reveal_field` 揭露的欄(spec §7)。 */
export function personalColumnNames(
  resource: AdminCatalogResource | null,
): readonly string[] {
  if (!resource) return [];
  return resource.columns
    .filter((column) => column.class === 'personal')
    .map((column) => column.name);
}
