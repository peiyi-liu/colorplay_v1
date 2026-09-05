import { useAdminWait } from '../hooks/use-admin-wait';
export function AdminPageLoading({
  title,
  onRetry,
}: Readonly<{ title: string; onRetry?: () => unknown }>) {
  const longWait = useAdminWait(true);
  return (
    <section className="page-wide page-stack admin-loading">
      <h1>{title}</h1>
      <div aria-label="頁面載入中" role="status">
        <p>{longWait ? '資料取得時間較長，尚未收到結果。' : '正在取得資料…'}</p>
        <div className="admin-loading__line" />
        <div className="admin-loading__line" />
        <div className="admin-loading__line" />
      </div>
      {longWait && onRetry ? (
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            void onRetry();
          }}
        >
          重新查詢
        </button>
      ) : null}
    </section>
  );
}
