export function RouteLoading({
  withinMain = false,
}: Readonly<{ withinMain?: boolean }>) {
  const status = (
    <p aria-label="頁面載入中" role="status">
      頁面載入中…
    </p>
  );

  return withinMain ? (
    <section aria-busy="true">{status}</section>
  ) : (
    <main aria-busy="true">{status}</main>
  );
}
