import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  browserProjectionColumns,
  filterableColumns,
  findBrowserResource,
  personalColumnNames,
} from '../api/admin-catalog';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { sortableColumns } from '../api/admin-catalog';
import { AdminDataTable } from '../components/admin-data-table';
import { AdminRevealDialog } from '../components/admin-reveal-dialog';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';

interface AdminListResourceOk {
  /** server 簽發的 keyset cursor;目前的 RPC 尚未簽發(見 checkpoint 記錄)。 */
  next_cursor?: string | null;
  outcome: 'ok';
  page_size_limit?: number;
  rows: readonly Record<string, unknown>[];
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
  request_id?: string;
  /**
   * spec §11 的 response 契約欄位。目前 `admin_internal_deny` 尚未回傳,
   * 因此實務上會是 undefined —— 這時一律當作**不可重試**:refetch 會原樣
   * 重送同一個 cursor/filter,對 COLUMN_NOT_ALLOWED 這類決定性的拒絕只會
   * 再被拒一次,變成永遠點不出結果的無效重試迴圈。
   */
  retryable?: boolean;
}

type AdminListResourceResponse = AdminListResourceOk | AdminOutcomeDenied;

interface AppliedQuery {
  filterColumn: string;
  filterValue: string;
  sortColumn: string;
}

const EMPTY_QUERY: AppliedQuery = {
  filterColumn: '',
  filterValue: '',
  sortColumn: '',
};

interface RevealTarget {
  column: string;
  rowId: string;
}

/**
 * Safe database browser(spec §3.2、§7):
 * - 資源、投影欄位與遮罩全部由 server 的 catalog 驅動;前端 catalog 只用來
 *   渲染 filter/sort 選項與判斷哪些欄是 personal(需要遮罩與揭露入口),
 *   絕不取代 server 驗證(AGENTS.md §5)。
 * - 未知/不可瀏覽資源一律回同一句「此資源不可瀏覽」,不區分是否存在
 *   (spec §11:無目標存在性洩漏)。
 * - 明文只在 AdminRevealDialog 內短暫存在,本頁不保留、不快取。
 */
export function AdminDataBrowserPage() {
  const params = useParams<{ domain: string; resource: string }>();
  const domain = params.domain ?? '';
  const resource = params.resource ?? '';
  const catalogResource = findBrowserResource(domain, resource);
  const personalColumns = personalColumnNames(catalogResource);

  const [draft, setDraft] = useState<AppliedQuery>(EMPTY_QUERY);
  const [applied, setApplied] = useState<AppliedQuery>(EMPTY_QUERY);
  const [revealTarget, setRevealTarget] = useState<RevealTarget | null>(null);

  // `/admin/data/:domain/:resource` 換 params 時 React Router 會**重用**同一個
  // 元件實例,useState 不會重置。若不主動清掉:
  //  1. 已揭露的明文與開著的 reveal dialog 會活過資源切換(明文外洩到另一個
  //     資源的畫面上),且舊的 row/column 會跟新的 domain/resource 混搭送出;
  //  2. 舊資源的 filter/sort 欄對新資源可能根本不合法,直接吃 COLUMN_NOT_ALLOWED。
  // 用渲染期調整狀態(React 官方 pattern,同 admin-shell.tsx 慣例),比 effect
  // 更早生效,不會先用舊 state 渲染一幀。
  const routeKey = `${domain}/${resource}`;
  const [previousRouteKey, setPreviousRouteKey] = useState(routeKey);
  if (previousRouteKey !== routeKey) {
    setPreviousRouteKey(routeKey);
    setDraft(EMPTY_QUERY);
    setApplied(EMPTY_QUERY);
    setRevealTarget(null);
  }

  const filters =
    applied.filterColumn !== '' && applied.filterValue !== ''
      ? { [applied.filterColumn]: { eq: applied.filterValue } }
      : {};
  const sort =
    applied.sortColumn !== '' ? { column: applied.sortColumn } : null;

  // keyset 分頁(spec §7):cursor 一律是 server 簽發的 opaque 值,前端只負責
  // 原樣帶回。今天的 admin_list_resource 尚未簽發 cursor,所以實務上只會有
  // 第一頁;等 server 開始回 next_cursor,這裡不必再改就能翻頁。
  const list = useInfiniteQuery({
    getNextPageParam: (lastPage: AdminListResourceResponse) =>
      lastPage.outcome === 'ok' &&
      typeof lastPage.next_cursor === 'string' &&
      lastPage.next_cursor !== ''
        ? lastPage.next_cursor
        : null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminRpc<AdminListResourceResponse>('admin_list_resource', {
        p_cursor: pageParam,
        p_domain: domain,
        p_filters: filters,
        p_resource: resource,
        p_sort: sort,
      }),
    queryKey: ['admin', 'data', domain, resource, applied],
  });

  const firstPage = list.data?.pages[0];
  // denial 可能發生在**任何一頁**(翻到第二頁時 session 剛好過期最典型)。
  // 只看第一頁的話,後續頁的 denial 會被下面的 flatMap 靜靜濾掉:畫面沒有
  // 錯誤、沒有導向,使用者只覺得「按了沒反應」,STALE_PRIVILEGED_SESSION
  // 更會因此不導向 challenge(違反 spec §3.3)。
  const firstPageCode = firstPage ? extractErrorCode(firstPage) : null;
  const laterDeniedPage = list.data?.pages
    .slice(1)
    .find((page) => page.outcome === 'denied');
  const laterPageCode = laterDeniedPage
    ? extractErrorCode(laterDeniedPage)
    : null;
  const code = firstPageCode ?? laterPageCode;
  const staleSession = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  if (list.isPending || staleSession) return <RouteLoading withinMain />;

  if (firstPageCode === 'RESOURCE_NOT_ALLOWED') {
    const requestId =
      firstPage && 'request_id' in firstPage ? firstPage.request_id : undefined;
    return (
      <section
        aria-labelledby="admin-data-browser-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-data-browser-page-heading">資料瀏覽器</h1>
        {/* 同一句文案涵蓋「不存在」與「存在但不允許」,不洩漏存在性 */}
        <p role="alert">此資源不可瀏覽</p>
        {typeof requestId === 'string' ? (
          <p>
            追蹤代碼：<span data-testid="admin-request-id">{requestId}</span>
          </p>
        ) : null}
      </section>
    );
  }

  if (list.isError || !firstPage || firstPage.outcome === 'denied') {
    return (
      <section
        aria-labelledby="admin-data-browser-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-data-browser-page-heading">資料瀏覽器</h1>
        {firstPageCode ? (
          <AdminStatusBanner code={firstPageCode} />
        ) : (
          <p role="alert">資料載入失敗，請稍後重試。</p>
        )}
        <button
          className="secondary-action"
          onClick={() => {
            void list.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const rows = list.data.pages.flatMap((page) =>
    page.outcome === 'ok' ? page.rows : [],
  );
  const lastPage = list.data.pages.at(-1);
  const nextCursor =
    lastPage?.outcome === 'ok' ? (lastPage.next_cursor ?? null) : null;
  // 欄位順序以 catalog 為準,但實際顯示哪些欄由 server 投影決定(server 是
  // 權威);若 server 回了 catalog 未列的欄(drift),仍照實顯示在最後,
  // 不靜默吞掉。
  const catalogNames = browserProjectionColumns(catalogResource).map(
    (column) => column.name,
  );
  const responseKeys = new Set(rows.flatMap((row) => Object.keys(row)));
  const orderedKeys = [
    ...catalogNames.filter((name) => responseKeys.has(name)),
    ...[...responseKeys].filter((name) => !catalogNames.includes(name)),
  ];
  const columns = (orderedKeys.length > 0 ? orderedKeys : catalogNames).map(
    (name) => ({
      header: name,
      key: name,
      personal: personalColumns.includes(name),
    }),
  );

  return (
    <section
      aria-labelledby="admin-data-browser-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-data-browser-page-heading">
        資料瀏覽器：{domain}/{resource}
      </h1>

      <form
        className="admin-data-browser__query"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
        }}
      >
        <div>
          <label htmlFor="admin-browser-filter-column">篩選欄位</label>
          <select
            id="admin-browser-filter-column"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                filterColumn: event.target.value,
              }));
            }}
            value={draft.filterColumn}
          >
            <option value="">不篩選</option>
            {filterableColumns(catalogResource).map((column) => (
              <option key={column.name} value={column.name}>
                {column.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="admin-browser-filter-value">篩選值</label>
          <input
            id="admin-browser-filter-value"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                filterValue: event.target.value,
              }));
            }}
            type="text"
            value={draft.filterValue}
          />
        </div>
        <div>
          <label htmlFor="admin-browser-sort-column">排序欄位</label>
          <select
            id="admin-browser-sort-column"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                sortColumn: event.target.value,
              }));
            }}
            value={draft.sortColumn}
          >
            <option value="">預設排序</option>
            {sortableColumns(catalogResource).map((column) => (
              <option key={column.name} value={column.name}>
                {column.name}
              </option>
            ))}
          </select>
        </div>
        <button className="secondary-action" type="submit">
          套用
        </button>
      </form>

      {/* 後續頁被拒:保留已載入的資料,但要明確說明為什麼載不到更多,並且
          一定要留一條出路 —— 被拒的那一頁會讓 cursor 消失,沒有重試入口的話
          這一頁就再也載不到了(review 波 P2)。 */}
      {laterDeniedPage ? (
        <div className="admin-data-browser__page-error">
          {laterPageCode ? (
            <AdminStatusBanner code={laterPageCode} />
          ) : (
            // 未知/缺漏的 code 不能只留一個空 banner
            <p role="alert">載入更多資料失敗，請稍後重試。</p>
          )}
          {typeof laterDeniedPage.request_id === 'string' ? (
            <p>
              追蹤代碼：
              <span data-testid="admin-later-request-id">
                {laterDeniedPage.request_id}
              </span>
            </p>
          ) : null}
          {laterDeniedPage.retryable === true ? (
            <button
              className="secondary-action"
              onClick={() => {
                // refetch 會用各頁自己的 pageParam 重跑,成功後被拒的那一頁
                // 會被正常結果取代,cursor 與「載入更多」也隨之回復。
                void list.refetch();
              }}
              type="button"
            >
              重試載入更多
            </button>
          ) : (
            // 重送同一個 cursor/filter 只會得到同一個拒絕;真正的出路是改條件
            // 後用上方的「套用」重跑整個查詢。
            <p>請調整篩選或排序條件後重新查詢。</p>
          )}
        </div>
      ) : null}

      <AdminDataTable
        caption={`${domain}/${resource}`}
        columns={columns}
        isLoadingMore={list.isFetchingNextPage}
        nextCursor={nextCursor}
        onLoadMore={() => {
          void list.fetchNextPage();
        }}
        pageSizeLimit={firstPage.page_size_limit ?? 50}
        rowActions={(rowIndex) => {
          // spec §1.3.5:具 id 欄的表允許裸 uuid 簡寫作為 rowKey。複合主鍵表
          // 的 PK 欄名權威在 DB schema(執行期由 pg_catalog 解析),沒有匯出到
          // 前端 catalog,因此前端無法自行組出 canonical row key —— 這些表
          // 不提供自動連結(見 checkpoint 記錄待決),而不是產生錯的連結。
          const rowId = rows[rowIndex]?.id;
          if (typeof rowId !== 'string') return null;
          return (
            <Link to={`/admin/data/${domain}/${resource}/${rowId}`}>明細</Link>
          );
        }}
        rowActionsHeader="明細"
        rows={rows}
        {...(personalColumns.length > 0
          ? {
              onReveal: (rowIndex: number, column: string) => {
                const rowId = rows[rowIndex]?.id;
                // uuid 定址是目前 Edge 唯一接線的 reveal 形態;沒有可用的
                // id 就不開框,不送一個註定被拒的請求。
                if (typeof rowId !== 'string') return;
                setRevealTarget({ column, rowId });
              },
            }
          : {})}
      />

      {revealTarget ? (
        <AdminRevealDialog
          column={revealTarget.column}
          domain={domain}
          onClose={() => {
            setRevealTarget(null);
          }}
          resource={resource}
          rowId={revealTarget.rowId}
        />
      ) : null}
    </section>
  );
}

export { AdminDataBrowserPage as Component };
