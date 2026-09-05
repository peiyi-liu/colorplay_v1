import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  CircleHelp,
  CircleCheck,
  TriangleAlert,
} from 'lucide-react';
import type { PlatformMetric } from '../api/admin-monitoring';
import { MONITOR_GROUPS } from '../lib/admin-monitor-labels';
import { formatAdminTimestamp } from '../lib/admin-time';

// A signal can belong to two business groups; count and display it only once.
const signals = MONITOR_GROUPS.flatMap((group) =>
  group.signals.map(([signal, title, description]) => ({
    signal,
    title,
    description,
    group,
  })),
).filter(
  (item, index, all) =>
    all.findIndex((other) => other.signal === item.signal) === index,
);
type Filter = 'attention' | 'incomplete' | 'all';
const labels = {
  ok: '本項檢查通過',
  attention: '需查核',
  unknown: '尚無資料',
  stale: '資料已過期',
};

export function AdminMonitorResults({
  metrics,
}: Readonly<{ metrics: PlatformMetric[] }>) {
  const [filter, setFilter] = useState<Filter>('attention');
  const items = signals.map((item) => ({
    ...item,
    metric: metrics.find((m) => m.signal === item.signal),
  }));
  const attention = items.filter(
    (i) => i.metric?.status === 'attention',
  ).length;
  const incomplete = items.filter(
    (i) => !i.metric || ['unknown', 'stale'].includes(i.metric.status),
  ).length;
  const passed = items.filter((i) => i.metric?.status === 'ok').length;
  const visible = items.filter(
    (i) =>
      filter === 'all' ||
      (filter === 'attention'
        ? i.metric?.status === 'attention'
        : !i.metric || ['unknown', 'stale'].includes(i.metric.status)),
  );
  return (
    <>
      <div className="admin-summary-grid" aria-label="監控摘要">
        {[
          ['需要查核', attention, '確認原因與影響範圍'],
          ['資料不足', incomplete, '缺少樣本、證據或資料已過期'],
          ['檢查通過', passed, '僅限每項標示的檢查範圍'],
          ['監控範圍', MONITOR_GROUPS.length, '教材、課堂、發布、服務與獎勵'],
        ].map(([title, value, note]) => (
          <div className="admin-summary-card" key={title}>
            <span>{title}</span>
            <strong>
              {value}
              <small>{title === '監控範圍' ? '類' : '項'}</small>
            </strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <section className="admin-monitor-panel" aria-label="監控檢查結果">
        <header className="admin-panel-heading">
          <div>
            <h2>檢查項目</h2>
            <p>點擊項目，查看檢查範圍與下一步。</p>
          </div>
          <div className="admin-monitor-filters" aria-label="篩選監控狀態">
            {(
              [
                ['attention', '需查核', attention],
                ['incomplete', '資料不足', incomplete],
                ['all', '全部', items.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => {
                  setFilter(id);
                }}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
        </header>
        <p className="sr-only" role="status">
          顯示 {visible.length} 個檢查項目
        </p>
        {visible.length === 0 ? (
          <div className="admin-empty-state">
            <CircleCheck aria-hidden="true" />
            <h3>
              {filter === 'incomplete'
                ? '目前沒有資料不足項目'
                : '目前沒有需查核項目'}
            </h3>
            <p>
              請一併查看全部檢查結果與觀測時間，單一篩選不代表全部服務正常。
            </p>
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                setFilter('all');
              }}
            >
              查看全部檢查
            </button>
          </div>
        ) : null}
        {MONITOR_GROUPS.map((group) => {
          const grouped = visible.filter((item) => item.group === group);
          return grouped.length ? (
            <section
              className="admin-monitor-section"
              aria-label={group.title}
              key={group.title}
            >
              <header>
                <h2>{group.title}</h2>
                <span>{grouped.length} 個項目</span>
              </header>
              {grouped.map(({ signal, title, description, metric }) => {
                const status = metric?.status ?? 'unknown';
                const Icon =
                  status === 'attention'
                    ? TriangleAlert
                    : status === 'ok'
                      ? CircleCheck
                      : CircleHelp;
                return (
                  <details className="admin-monitor-item" key={signal}>
                    <summary>
                      <Icon
                        aria-hidden="true"
                        className={'admin-monitor-icon--' + status}
                      />
                      <h3>{title}</h3>
                      <span className="admin-monitor-result">
                        {metric?.value != null && metric.sample_count != null
                          ? `${String(metric.value)} 筆異常／${String(metric.sample_count)} 筆檢查`
                          : metric?.failed_count != null && metric.sample_count
                            ? `HTTP 失敗：${String(metric.failed_count)}／${String(metric.sample_count)}`
                            : ''}
                      </span>
                      <span
                        className={
                          'admin-monitor__state admin-monitor__state--' + status
                        }
                      >
                        {labels[status]}
                      </span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div className="admin-monitor-detail">
                      <p>
                        <strong>檢查範圍</strong> {description}
                      </p>
                      {metric?.failed_count != null &&
                      metric.sample_count != null &&
                      metric.sample_count > 0 ? (
                        <p>
                          HTTP 失敗率：
                          {(
                            (metric.failed_count / metric.sample_count) *
                            100
                          ).toFixed(1)}
                          %
                        </p>
                      ) : null}
                      {signal.endsWith('_http') ? (
                        <p>
                          來源延遲 p95：
                          {metric?.p95_ms == null
                            ? '尚無有效樣本'
                            : metric.p95_ms.toFixed(0) + ' ms'}
                        </p>
                      ) : null}
                      {signal === 'backup_inventory' && metric?.observed_at ? (
                        <p>
                          最近備份：{formatAdminTimestamp(metric.observed_at)}
                        </p>
                      ) : null}
                      {metric?.revision ? (
                        <p>
                          部署版本：<code>{metric.revision.slice(0, 12)}</code>
                        </p>
                      ) : null}
                      {metric?.evidence_run_id ? (
                        <a
                          href={
                            'https://github.com/peiyi-liu/colorplay_v1/actions/runs/' +
                            String(metric.evidence_run_id)
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看驗證作業
                        </a>
                      ) : null}
                      <p>
                        {metric
                          ? (metric.source === 'database'
                              ? '資料庫查核'
                              : '受信任採集') +
                            ' · 最近檢查：' +
                            formatAdminTimestamp(metric.checked_at)
                          : '尚未取得此項目的受信任資料。'}
                      </p>
                      {metric?.window_started_at && metric.observed_at ? (
                        <p>
                          觀測時間：
                          {formatAdminTimestamp(
                            metric.window_started_at,
                          )} ～ {formatAdminTimestamp(metric.observed_at)}
                        </p>
                      ) : null}
                      <p>
                        <strong>建議下一步</strong> {group.action}
                      </p>
                      <Link to={group.href}>前往查核 →</Link>
                    </div>
                  </details>
                );
              })}
            </section>
          ) : null;
        })}
        <p className="admin-monitor-footnote">
          資料庫查核每分鐘更新；外部每 15 分鐘採集，超過 45
          分鐘未更新會標示過期。尚無資料不代表正常。
        </p>
      </section>
    </>
  );
}
