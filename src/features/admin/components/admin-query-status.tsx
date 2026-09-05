import { useEffect, useState } from 'react';
import { formatAdminTimestamp } from '../lib/admin-time';

export interface AdminQuerySnapshot {
  dataUpdatedAt: number;
  isFetching: boolean;
  isError: boolean;
  refetch: () => unknown;
}
export function AdminQueryStatus({
  query,
}: Readonly<{ query: AdminQuerySnapshot }>) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 5_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const stale = now - query.dataUpdatedAt >= 30_000;
  return (
    <div className="admin-query-status" aria-label="資料更新狀態">
      <p aria-live="polite">
        {query.isFetching
          ? '正在更新資料…'
          : query.isError
            ? query.dataUpdatedAt
              ? '更新失敗，目前顯示上次取得的資料。'
              : '尚未取得資料，請重新查詢。'
            : stale
              ? '資料可能已過期，操作前請重新整理。'
              : '已取得最新查詢結果。'}
      </p>
      <span>
        最近取得：
        {query.dataUpdatedAt
          ? formatAdminTimestamp(new Date(query.dataUpdatedAt).toISOString())
          : '尚未取得'}
      </span>
      <button
        type="button"
        className="secondary-action"
        disabled={query.isFetching}
        onClick={() => {
          void query.refetch();
        }}
      >
        {query.isFetching ? '更新中…' : '重新整理'}
      </button>
    </div>
  );
}
