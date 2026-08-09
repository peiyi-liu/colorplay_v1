// Build-time import of the machine-generated sensitivity catalog
// (spec §9;Task 4 產出 + CI drift 強制)。`?raw` 讓 tsc 只看到 string、不必
// 為 113KB JSON 推導巨型字面型別,也不需要動 tsconfig 的 resolveJsonModule/
// include —— 但打包時仍是 build-time 內嵌,不會在執行期去抓檔案。
//
// **這份資料只決定 UI 選項渲染**(要顯示哪些欄、哪些欄可 filter/sort、哪些
// 欄是 personal 需要遮罩與「揭露」入口)。授權與投影的權威一律在 PostgreSQL
// RPC 自己的 catalog 查詢(AGENTS.md §5、spec §7):前端就算被竄改成把
// forbidden 欄排進 filter,server 仍會回 COLUMN_NOT_ALLOWED。
import catalogRaw from '../../../../supabase/catalog/admin-sensitivity-catalog.json?raw';

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

interface AdminCatalogFile {
  resources: readonly AdminCatalogResource[];
  source_sha256: string;
  version: number;
}

const catalog = JSON.parse(catalogRaw) as AdminCatalogFile;

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
