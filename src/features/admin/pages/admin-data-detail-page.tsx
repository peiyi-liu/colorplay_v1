import { safeTraceId } from '../api/admin-outcome';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AdminPageLoading } from '../components/admin-page-loading';
import { AdminQueryStatus } from '../components/admin-query-status';
import {
  browserProjectionColumns,
  findBrowserResource,
  personalColumnNames,
} from '../api/admin-catalog';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import {
  AdminRevealDialog,
  type AdminRevealLocator,
} from '../components/admin-reveal-dialog';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';

interface AdminDetailOk {
  outcome: 'ok';
  relations: readonly unknown[];
  row: Record<string, unknown> | null;
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
  request_id?: string;
  retryable?: boolean;
}

type AdminDetailResponse = AdminDetailOk | AdminOutcomeDenied;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * base64url 的**字元集**檢查,不是解碼(spec §1.3.6:前端不得解析 token)。
 * 這裡只擋掉根本不可能是 token 的網址片段(空字串、含 `/`、`=`、空白…),
 * 讓明顯打錯的網址得到「位址無效」而不是一句語意不符的欄位拒絕。token 的
 * 內容是否有效——PK 欄集合、資格、存在性——一律由 server 判定。
 */
const ROW_TOKEN_CHARSET = /^[A-Za-z0-9_-]+$/u;

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * 單筆 detail(spec §3.2、§1.3、§7):固定 detail projection,不接受任意 join。
 * personal 欄維持遮罩,只能經 AdminRevealDialog 一次揭露一欄;明文不離開該
 * dialog。未知列回同一句「查無此筆資料」,不洩漏是否存在過。
 */
export function AdminDataDetailPage() {
  const params = useParams<{
    domain: string;
    resource: string;
    rowKey: string;
  }>();
  const domain = params.domain ?? '';
  const resource = params.resource ?? '';
  const rowKey = params.rowKey ?? '';
  const catalogResource = findBrowserResource(domain, resource);
  const personalColumns = personalColumnNames(catalogResource);

  const [revealColumn, setRevealColumn] = useState<string | null>(null);

  // 與列表頁同理:同一 route pattern 換 params 時元件會被重用,已揭露的明文
  // 與舊欄位目標不得存活到另一筆資料。
  const routeKey = `${domain}/${resource}/${rowKey}`;
  const [previousRouteKey, setPreviousRouteKey] = useState(routeKey);
  if (previousRouteKey !== routeKey) {
    setPreviousRouteKey(routeKey);
    setRevealColumn(null);
  }

  // 兩種位址(spec §1.3.6):server 簽發的 opaque row token(涵蓋複合主鍵),
  // 以及具 `id` 欄資源的既有裸 uuid 路徑。挑 overload 只看**外形**,不看
  // 內容 —— token 原樣送進 `p_row_token`,由 DB 解碼與驗證。
  const isUuidKey = UUID_PATTERN.test(rowKey);
  const malformedRowKey = !isUuidKey && !ROW_TOKEN_CHARSET.test(rowKey);
  const detailArgs = isUuidKey
    ? { p_domain: domain, p_resource: resource, p_row_id: rowKey }
    : { p_domain: domain, p_resource: resource, p_row_token: rowKey };

  const detail = useQuery({
    enabled: !malformedRowKey,
    queryFn: () =>
      adminRpc<AdminDetailResponse>('admin_get_resource_detail', detailArgs),
    queryKey: ['admin', 'data-detail', domain, resource, rowKey],
  });

  const code = detail.data ? extractErrorCode(detail.data) : null;
  const staleSession = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  const backLink = (
    <Link to={`/admin/data/${domain}/${resource}`}>返回列表</Link>
  );

  if (malformedRowKey) {
    return (
      <section
        aria-labelledby="admin-data-detail-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-data-detail-page-heading">資料明細</h1>
        <p role="alert">此筆資料位址無效</p>
        {backLink}
      </section>
    );
  }

  if (detail.isPending || staleSession)
    return (
      <AdminPageLoading title="資料明細" onRetry={() => detail.refetch()} />
    );

  if (code === 'RESOURCE_NOT_ALLOWED') {
    return (
      <section
        aria-labelledby="admin-data-detail-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-data-detail-page-heading">資料明細</h1>
        <p role="alert">此資源不可瀏覽</p>
      </section>
    );
  }

  if (!detail.data || detail.data.outcome === 'denied') {
    // 網路層失敗時 data 可能根本不存在,不能無條件讀 outcome
    const response: AdminDetailResponse | undefined = detail.data;
    const denied = response?.outcome === 'denied' ? response : undefined;
    // 網路層失敗沒有 envelope,重試是唯一出路;已入帳的 denial 依 §11 的
    // retryable 決定 —— 重送同一個位址只會再被拒一次。
    const canRetry = !denied || denied.retryable === true;
    return (
      <section
        aria-labelledby="admin-data-detail-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-data-detail-page-heading">資料明細</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">資料載入失敗，請稍後重試。</p>
        )}
        {typeof denied?.request_id === 'string' ? (
          <p>
            追蹤代碼：
            <span data-testid="admin-request-id">
              {safeTraceId(denied.request_id)}
            </span>
          </p>
        ) : null}
        {canRetry ? (
          <button
            className="secondary-action"
            onClick={() => {
              void detail.refetch();
            }}
            type="button"
          >
            重試
          </button>
        ) : null}
        {backLink}
      </section>
    );
  }

  const row = detail.data.row;

  if (row === null) {
    return (
      <section
        aria-labelledby="admin-data-detail-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-data-detail-page-heading">資料明細</h1>
        {/* 與「不允許」共用同一種語氣,不透露這筆資料是否曾經存在 */}
        <p role="alert">查無此筆資料</p>
        {backLink}
      </section>
    );
  }

  const catalogNames = browserProjectionColumns(catalogResource).map(
    (column) => column.name,
  );
  const rowKeys = Object.keys(row);
  const orderedKeys = [
    ...catalogNames.filter((name) => rowKeys.includes(name)),
    ...rowKeys.filter((name) => !catalogNames.includes(name)),
  ];
  // reveal 沿用**本頁載入這筆資料時用的同一個定址**,不從 row 內容再推一次:
  // 複合主鍵資源的 PK 欄未必在投影裡,而且再推一次就等於前端自行組定址。
  const revealLocator: AdminRevealLocator = isUuidKey
    ? { kind: 'row_id', value: rowKey }
    : { kind: 'row_token', value: rowKey };

  return (
    <section
      aria-labelledby="admin-data-detail-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-data-detail-page-heading">
        資料明細：{domain}/{resource}
      </h1>
      <AdminQueryStatus query={detail} />
      {backLink}
      <dl className="admin-data-detail__fields">
        {orderedKeys.map((name) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              {cellText(row[name])}
              {personalColumns.includes(name) ? (
                <button
                  className="admin-data-table__reveal"
                  onClick={() => {
                    setRevealColumn(name);
                  }}
                  type="button"
                >
                  揭露 {name}
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {revealColumn !== null ? (
        <AdminRevealDialog
          column={revealColumn}
          domain={domain}
          locator={revealLocator}
          onClose={() => {
            setRevealColumn(null);
          }}
          resource={resource}
        />
      ) : null}
    </section>
  );
}

export { AdminDataDetailPage as Component };
