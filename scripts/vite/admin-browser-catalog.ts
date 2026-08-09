import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * 只把 Admin safe-browser UI 真正需要的 catalog 子集打進 client bundle。
 *
 * 為什麼需要這個 plugin:完整的 `admin-sensitivity-catalog.json` 含全部控制表
 * (`admin_command_authorizations`、`admin_audit_events`…)與所有 `forbidden`
 * 欄名(`token_hash`、`bound_factor_id_snapshot`、`join_code_hash`…)。整包
 * 匯入等於把安全 schema 寫進一個**公開可取的靜態 JS 資產** —— route guard
 * 保護不了 /assets/*.js,任何未登入的人都能下載閱讀,違反 spec §3.3
 *「無 schema 洩漏」。
 *
 * UI 需要的其實只有:browser surface 的資源、以及其中非 forbidden 欄的
 * 名稱/敏感度/可篩選可排序旗標。所以在 build time 就濾掉其餘部分,bundle
 * 裡從此不存在控制表與 forbidden 欄名。
 *
 * 單一事實來源不變:仍讀同一份 Task 4 產生、CI drift 強制的 JSON,不另存
 * 一份會漂移的副本。授權權威一樣在 PostgreSQL(AGENTS.md §5)。
 */
const VIRTUAL_ID = 'virtual:admin-browser-catalog';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const CATALOG_PATH = 'supabase/catalog/admin-sensitivity-catalog.json';

interface SourceColumn {
  class: string;
  filterable: boolean;
  mask_strategy: string | null;
  name: string;
  searchable: boolean;
  sortable: boolean;
}

interface SourceResource {
  columns: SourceColumn[];
  domain: string;
  export: boolean;
  resource: string;
  surface: string;
}

interface SourceCatalog {
  resources: SourceResource[];
}

export function adminBrowserCatalogPlugin(root = process.cwd()): Plugin {
  const catalogFile = path.resolve(root, CATALOG_PATH);

  return {
    name: 'colorplay-admin-browser-catalog',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      this.addWatchFile(catalogFile);

      const parsed = JSON.parse(
        await readFile(catalogFile, 'utf8'),
      ) as SourceCatalog;

      const resources = parsed.resources
        .filter((resource) => resource.surface === 'browser')
        .map((resource) => ({
          columns: resource.columns
            .filter((column) => column.class !== 'forbidden')
            .map((column) => ({
              class: column.class,
              filterable: column.filterable,
              mask_strategy: column.mask_strategy,
              name: column.name,
              searchable: column.searchable,
              sortable: column.sortable,
            })),
          domain: resource.domain,
          export: resource.export,
          resource: resource.resource,
          surface: resource.surface,
        }));

      // 濾出空的通常代表 catalog 結構變了;寧可讓 build 大聲失敗,也不要
      // 悄悄產出空 catalog 讓 UI 看起來「沒有任何欄位」。
      if (resources.length === 0) {
        throw new Error('ADMIN_BROWSER_CATALOG_EMPTY');
      }

      return `export default ${JSON.stringify({ resources })};`;
    },
  };
}
