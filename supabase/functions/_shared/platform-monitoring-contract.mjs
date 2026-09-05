export function validateTarget(ref) {
  if (ref !== 'onkxnkzeixpezetkmocf')
    throw new Error('MONITOR_TARGET_MISMATCH');
  return ref;
}
function count(value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 0
  )
    throw new Error('MONITOR_SAMPLE_INVALID');
  return Number(value);
}
export function normalizeHttpMetric(row) {
  const samples = count(row.sample_count),
    failed = count(row.failed_count),
    valid = count(row.valid_status_count);
  if (failed > valid || valid > samples)
    throw new Error('MONITOR_SAMPLE_INVALID');
  const latency =
    row.p95_ms == null || row.p95_ms === '' ? null : Number(row.p95_ms);
  if (latency !== null && (!Number.isFinite(latency) || latency < 0))
    throw new Error('MONITOR_SAMPLE_INVALID');
  return {
    sample_count: samples,
    failed_count: valid === samples ? failed : null,
    p95_ms: latency,
    status:
      samples === 0 || valid !== samples
        ? 'unknown'
        : failed > 0
          ? 'attention'
          : 'ok',
  };
}
export function normalizeBackup(body, now) {
  if (!Array.isArray(body.backups)) throw new Error('MONITOR_BACKUP_INVALID');
  const completed = body.backups
    .filter(
      (b) =>
        b.status === 'COMPLETED' &&
        Number.isFinite(Date.parse(b.inserted_at)) &&
        Date.parse(b.inserted_at) <= now.getTime(),
    )
    .sort((a, b) => Date.parse(b.inserted_at) - Date.parse(a.inserted_at));
  if (!completed.length) return { status: 'unknown', observed_at: null };
  return {
    status:
      now.getTime() - Date.parse(completed[0].inserted_at) > 26 * 3600_000
        ? 'attention'
        : 'ok',
    observed_at: new Date(completed[0].inserted_at).toISOString(),
  };
}
export const HTTP_PATHS = {
  login_http: ['/auth/v1/token', '/functions/v1/auth-login'],
  content_http: [
    '/rest/v1/rpc/get_review_cards',
    '/rest/v1/rpc/get_learning_progress',
    '/rest/v1/rpc/get_quiz_question',
    '/rest/v1/rpc/get_accessible_chapter_review',
    '/rest/v1/quiz_session_question_state',
  ],
  answer_http: [
    '/rest/v1/rpc/submit_quiz_answer',
    '/rest/v1/rpc/submit_live_answer',
  ],
};
export function logsQuery(paths) {
  // Fixed allowlist only: never interpolate user-supplied paths or request contents.
  if (!Object.values(HTTP_PATHS).includes(paths))
    throw new Error('MONITOR_PATH_INVALID');
  return (
    "select count() as sample_count, countIf(toInt32OrZero(log_attributes['response.status_code']) between 100 and 599) as valid_status_count, countIf(toInt32OrZero(log_attributes['response.status_code']) between 400 and 599) as failed_count, quantileOrNull(0.95)(toFloat64OrNull(log_attributes['response.headers.x_kong_upstream_latency'])) as p95_ms from logs where source in ('edge_logs','function_edge_logs') and log_attributes['request.method'] != 'OPTIONS' and log_attributes['request.path'] in (" +
    paths.map((p) => "'" + p + "'").join(',') +
    ')'
  );
}
