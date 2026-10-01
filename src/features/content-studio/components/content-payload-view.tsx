const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: '標題',
  content: '內容',
  prompt: '題目',
  explanation: '解說',
  group_label: '學生主標題（群組標籤）',
  description: '說明',
  options: '選項與正確答案',
  course_id: '所屬課程 ID',
  chapter_id: '章節 ID',
  section_id: '小節 ID',
  subtopic_id: '子主題 ID',
  bank_id: '題目集合 ID',
  kind: '題庫類型',
  sort_order: '編號／順序',
  media: '圖片',
  duration_seconds: '題目時間（秒）',
  question_type: '題型',
  selection_settings: '出題設定',
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空白）';
  if (typeof value === 'string') return value;
  if (
    Array.isArray(value) &&
    value.every(
      (option) =>
        typeof option === 'object' &&
        option !== null &&
        'key' in option &&
        'text' in option,
    )
  )
    return value
      .map(
        (option: { key: string; text: string; is_correct?: boolean }) =>
          `${option.key}. ${option.text}${option.is_correct ? ' ✓ 正確答案' : ''}`,
      )
      .join('\n');
  return JSON.stringify(value, null, 2);
}

export function ContentPayloadView({
  payload,
}: Readonly<{ payload: Readonly<Record<string, unknown>> }>) {
  return (
    <dl className="content-payload">
      {Object.entries(payload).map(([field, value]) => (
        <div key={field}>
          <dt>{FIELD_LABELS[field] ?? field}</dt>
          <dd>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ContentDraftDiff({
  current,
  draft,
}: Readonly<{
  current: Readonly<Record<string, unknown>> | null;
  draft: Readonly<Record<string, unknown>>;
}>) {
  return (
    <details className="content-workflow__result" open>
      <summary>核對正式內容與待發布草稿</summary>
      <div className="content-editor__scope-grid">
        <section aria-label="目前正式內容">
          <h3>目前正式內容</h3>
          {current ? (
            <ContentPayloadView payload={current} />
          ) : (
            <p>尚未發布。</p>
          )}
        </section>
        <section aria-label="待發布草稿內容">
          <h3>待發布草稿內容</h3>
          <ContentPayloadView payload={draft} />
        </section>
      </div>
    </details>
  );
}
