import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';

interface AdminAuditRow {
  action: string;
  actor_principal_id: string | null;
  actor_type: string;
  before_after_redacted: unknown;
  id: string;
  mfa_age_seconds: number | null;
  occurred_at: string;
  reason_or_purpose_redacted: string | null;
  request_id: string | null;
  result: string;
  target_principal_id: string | null;
  target_type: string;
}

interface AdminQueryAuditOk {
  outcome: 'ok';
  rows: readonly AdminAuditRow[];
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
}

type AdminQueryAuditResponse = AdminQueryAuditOk | AdminOutcomeDenied;

interface AuditFilters {
  action: string;
  actorPrincipalId: string;
  from: string;
  result: string;
  targetType: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = {
  action: '',
  actorPrincipalId: '',
  from: '',
  result: '',
  targetType: '',
  to: '',
};

const orNull = (value: string): string | null => (value === '' ? null : value);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// datetime-local 是本地時間字串;RPC 參數是 timestamptz,統一轉 ISO 再送,
// 避免瀏覽器時區被當成 UTC 解讀而查錯區間。
const toIso = (value: string): string | null => {
  if (value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * 受控 audit 查詢(spec §3.2、§10):
 * - 僅五個 filter(時間、actor principal、action、target type、result),
 *   與 `admin_query_audit` 的參數一一對應。
 * - 只呈現 server 已 redact 的欄位;明文個資、secret、reveal 明文依設計
 *   從來不會進 `admin_audit_events`。
 * - **沒有任何 export/download 控制項**(spec §10、§7:Phase 1 無 export)。
 */
export function AdminAuditPage() {
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS);
  const [actorError, setActorError] = useState(false);

  const query = useQuery({
    queryFn: () =>
      adminRpc<AdminQueryAuditResponse>('admin_query_audit', {
        p_action: orNull(applied.action),
        p_actor_principal_id: orNull(applied.actorPrincipalId),
        p_cursor: null,
        p_from: toIso(applied.from),
        p_result: orNull(applied.result),
        p_target_type: orNull(applied.targetType),
        p_to: toIso(applied.to),
      }),
    queryKey: ['admin', 'audit', applied],
  });

  const code = query.data ? extractErrorCode(query.data) : null;
  const staleSession = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  const filterForm = (
    <form
      className="admin-audit__filters"
      onSubmit={(event) => {
        event.preventDefault();
        // p_actor_principal_id 是 uuid 參數:送出畸形值會讓 PostgREST 直接
        // 丟型別轉換錯誤(非 typed denial),頁面只剩「重試」而重試又送同一個
        // 壞值。先在前端擋住,server 仍然是最終權威。
        if (
          draft.actorPrincipalId !== '' &&
          !UUID_PATTERN.test(draft.actorPrincipalId.trim())
        ) {
          setActorError(true);
          return;
        }
        setActorError(false);
        setApplied({
          ...draft,
          actorPrincipalId: draft.actorPrincipalId.trim(),
        });
      }}
    >
      <div>
        <label htmlFor="admin-audit-from">起始時間</label>
        <input
          id="admin-audit-from"
          onChange={(event) => {
            setDraft((current) => ({ ...current, from: event.target.value }));
          }}
          type="datetime-local"
          value={draft.from}
        />
      </div>
      <div>
        <label htmlFor="admin-audit-to">結束時間</label>
        <input
          id="admin-audit-to"
          onChange={(event) => {
            setDraft((current) => ({ ...current, to: event.target.value }));
          }}
          type="datetime-local"
          value={draft.to}
        />
      </div>
      <div>
        <label htmlFor="admin-audit-actor">Actor principal</label>
        <input
          aria-describedby={actorError ? 'admin-audit-actor-error' : undefined}
          aria-invalid={actorError ? 'true' : 'false'}
          id="admin-audit-actor"
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              actorPrincipalId: event.target.value,
            }));
          }}
          type="text"
          value={draft.actorPrincipalId}
        />
        {actorError ? (
          <p id="admin-audit-actor-error" role="alert">
            Actor principal 必須是有效的 UUID
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="admin-audit-action">動作</label>
        <input
          id="admin-audit-action"
          onChange={(event) => {
            setDraft((current) => ({ ...current, action: event.target.value }));
          }}
          type="text"
          value={draft.action}
        />
      </div>
      <div>
        <label htmlFor="admin-audit-target-type">目標類型</label>
        <input
          id="admin-audit-target-type"
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              targetType: event.target.value,
            }));
          }}
          type="text"
          value={draft.targetType}
        />
      </div>
      <div>
        <label htmlFor="admin-audit-result">結果</label>
        <input
          id="admin-audit-result"
          onChange={(event) => {
            setDraft((current) => ({ ...current, result: event.target.value }));
          }}
          type="text"
          value={draft.result}
        />
      </div>
      <button className="secondary-action" type="submit">
        查詢
      </button>
    </form>
  );

  if (query.isPending || staleSession) return <RouteLoading withinMain />;

  if (query.isError || query.data.outcome === 'denied') {
    return (
      <section
        aria-labelledby="admin-audit-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-audit-page-heading">稽核紀錄</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">稽核查詢失敗，請稍後重試。</p>
        )}
        {/* 表單必須留著:失敗常常就是某個 filter 值造成的,只給「重試」
            會把同一個壞值再送一次,使用者永遠出不來。 */}
        {filterForm}
        <button
          className="secondary-action"
          onClick={() => {
            void query.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const rows = query.data.rows;

  return (
    <section
      aria-labelledby="admin-audit-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-audit-page-heading">稽核紀錄</h1>
      {filterForm}
      {rows.length === 0 ? (
        <p>這段期間沒有稽核事件。</p>
      ) : (
        <div className="ui-table-scroll admin-data-table__scroll">
          <table aria-label="稽核事件" className="ui-table">
            <thead>
              <tr>
                <th scope="col">時間</th>
                <th scope="col">動作</th>
                <th scope="col">目標類型</th>
                <th scope="col">結果</th>
                <th scope="col">Actor</th>
                <th scope="col">目標 principal</th>
                <th scope="col">理由／目的（已遮蔽）</th>
                <th scope="col">追蹤代碼</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.occurred_at).toLocaleString('zh-TW')}</td>
                  <td>{row.action}</td>
                  <td>{row.target_type}</td>
                  <td>{row.result}</td>
                  <td>{row.actor_principal_id ?? row.actor_type}</td>
                  <td>{row.target_principal_id ?? '—'}</td>
                  <td>{row.reason_or_purpose_redacted ?? '—'}</td>
                  <td>{row.request_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export { AdminAuditPage as Component };
