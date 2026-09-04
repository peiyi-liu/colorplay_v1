/**
 * 由 scripts/vite/admin-browser-catalog.ts 於 build time 產生的虛擬模組:
 * 只含 browser surface 資源、且已剔除全部 forbidden 欄(見該 plugin 的說明)。
 */
declare module 'virtual:admin-browser-catalog' {
  const catalog: {
    resources: {
      columns: {
        class: string;
        filterable: boolean;
        mask_strategy: string | null;
        name: string;
        searchable: boolean;
        sortable: boolean;
      }[];
      domain: string;
      export: boolean;
      resource: string;
      surface: string;
    }[];
  };
  export default catalog;
}
