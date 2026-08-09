import type { ReactNode } from 'react';

export interface AdminDataTableColumn {
  header: string;
  key: string;
  /** catalog class='personal':固定遮罩,且是唯一可揭露的欄(spec §7、§9.2)。 */
  personal: boolean;
}

export interface AdminDataTableProps {
  caption: string;
  columns: readonly AdminDataTableColumn[];
  isLoadingMore?: boolean;
  /** server 簽發的 opaque cursor;沒有就是沒有下一頁入口,前端絕不自行構造。 */
  nextCursor?: string | null;
  onLoadMore?: (cursor: string) => void;
  onReveal?: (rowIndex: number, column: string) => void;
  pageSizeLimit?: number;
  /** 由呼叫端渲染(明細連結等);表格本身保持與 router 解耦。 */
  rowActions?: (rowIndex: number) => ReactNode;
  rowActionsHeader?: string;
  rows: readonly Record<string, unknown>[];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // jsonb 欄(rule_parameters、question_ids、frozen_options…)是物件/陣列,
  // 直接 String() 會變成無意義的 [object Object]。
  return JSON.stringify(value);
}

/**
 * Safe browser 結果表(spec §7、§3.4):
 * - 欄位與遮罩值全部來自 server 投影,前端不自己算遮罩、不自己決定可見欄。
 * - personal 欄旁才有「揭露」入口,且只在呼叫端提供 onReveal 時出現。
 * - 「載入更多」只在 server 真的簽發 cursor 時出現:cursor 是 server-issued
 *   opaque value(spec §7),前端偽造的 cursor 會被 server 的 binding 檢查
 *   打回 COLUMN_NOT_ALLOWED,假裝有下一頁只會製造 denial 噪音。
 * - 寬表在自身容器橫向捲動(.ui-table-scroll),頁面本體不水平捲動。
 * - 無任何 export/download 控制項(spec §7:Phase 1 全表 export=false)。
 */
export function AdminDataTable({
  caption,
  columns,
  isLoadingMore = false,
  nextCursor = null,
  onLoadMore,
  onReveal,
  pageSizeLimit,
  rowActions,
  rowActionsHeader = '操作',
  rows,
}: Readonly<AdminDataTableProps>) {
  if (rows.length === 0) {
    return <p>查詢結果沒有資料。</p>;
  }

  const canLoadMore =
    typeof nextCursor === 'string' && nextCursor !== '' && onLoadMore;
  const atPageLimit =
    !canLoadMore &&
    typeof pageSizeLimit === 'number' &&
    rows.length >= pageSizeLimit;

  return (
    <div className="ui-table-scroll admin-data-table__scroll">
      <table aria-label={caption} className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
            {rowActions ? <th scope="col">{rowActionsHeader}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            // 這些列沒有可靠的前端唯一鍵(PK 欄可能是複合鍵、也可能不在投影裡),
            // 且清單是唯讀重新整理式渲染,用索引當 key 不會造成狀態錯位。
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>
                  {cellText(row[column.key])}
                  {column.personal && onReveal ? (
                    <button
                      className="admin-data-table__reveal"
                      onClick={() => {
                        onReveal(rowIndex, column.key);
                      }}
                      type="button"
                    >
                      揭露 {column.key}
                    </button>
                  ) : null}
                </td>
              ))}
              {rowActions ? <td>{rowActions(rowIndex)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canLoadMore ? (
        <button
          className="secondary-action"
          disabled={isLoadingMore}
          onClick={() => {
            onLoadMore(nextCursor);
          }}
          type="button"
        >
          {isLoadingMore ? '載入中…' : '載入更多'}
        </button>
      ) : null}
      {atPageLimit ? (
        <p>
          已達單頁上限 {pageSizeLimit}{' '}
          筆；伺服器未提供下一頁指標，請縮小篩選範圍後再查詢。
        </p>
      ) : null}
    </div>
  );
}
