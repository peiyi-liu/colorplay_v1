import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  browserProjectionColumns,
  findBrowserResource,
  personalColumnNames,
} from '../api/admin-catalog';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { AdminRevealDialog } from '../components/admin-reveal-dialog';
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
}

type AdminDetailResponse = AdminDetailOk | AdminOutcomeDenied;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * spec §1.3.5:`rowKey`＝base64url(canonical JSON,鍵依字母序);具 `id` 欄的
 * 表允許裸 uuid 簡寫(視為 `{"id": value}`)。前端只負責挑對 overload 並透傳,
 * 驗證(PK 欄集合、資格、存在性)一律在 server。
 */
function decodeRowKey(rowKey: string): Record<string, string> | null {
  try {
    const base64 = rowKey.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const entries = Object.entries(parsed);
    if (entries.length === 0) return null;
    if (!entries.every(([, value]) => typeof value === 'string')) return null;
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}

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

  const compositeKey = UUID_PATTERN.test(rowKey) ? null : decodeRowKey(rowKey);
  const detailArgs = compositeKey
    ? { p_domain: domain, p_resource: resource, p_row_key: compositeKey }
    : { p_domain: domain, p_resource: resource, p_row_id: rowKey };

  const detail = useQuery({
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

  if (detail.isPending || staleSession) return <RouteLoading withinMain />;

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

  if (detail.isError || detail.data.outcome === 'denied') {
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
        <button
          className="secondary-action"
          onClick={() => {
            void detail.refetch();
          }}
          type="button"
        >
          重試
        </button>
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
  const rowId = row.id;
  const canReveal = typeof rowId === 'string';

  return (
    <section
      aria-labelledby="admin-data-detail-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-data-detail-page-heading">
        資料明細：{domain}/{resource}
      </h1>
      {backLink}
      <dl className="admin-data-detail__fields">
        {orderedKeys.map((name) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              {cellText(row[name])}
              {personalColumns.includes(name) && canReveal ? (
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

      {revealColumn !== null && typeof rowId === 'string' ? (
        <AdminRevealDialog
          column={revealColumn}
          domain={domain}
          onClose={() => {
            setRevealColumn(null);
          }}
          resource={resource}
          rowId={rowId}
        />
      ) : null}
    </section>
  );
}

export { AdminDataDetailPage as Component };
