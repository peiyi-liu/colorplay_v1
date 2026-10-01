import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createContentPublicationRepository,
  type ContentPublicationRepository,
} from '../api/content-publication-repository';
import type { ContentEditorState } from '../api/contracts';
import type { ChangeClassification } from '../api/content-publication-contracts';
import type { ContentStudioItem } from '../lib/content-studio-model';
import { ContentDraftDiff, ContentPayloadView } from './content-payload-view';

const IMPACT_LABELS = {
  compatible: '保留目前進度',
  requires_recompletion: '需重新完成內容',
  requires_requalification: '需重新通過測驗資格',
} as const;

const EVENT_LABELS = {
  archive: '封存',
  publish: '發布',
  rollback: '回復',
} as const;

export function ContentPublicationWorkflow({
  editorState,
  mode,
  onChanged,
  repository = createContentPublicationRepository(),
  selected,
}: Readonly<{
  editorState: ContentEditorState | null;
  mode?: 'publication' | 'history';
  onChanged: () => void;
  repository?: ContentPublicationRepository | undefined;
  selected: ContentStudioItem | null;
}>) {
  const [reason, setReason] = useState('');
  const [changeClassification, setChangeClassification] =
    useState<ChangeClassification>('semantic');
  const [confirmed, setConfirmed] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState('');
  const publishRequestId = useRef<string | null>(null);
  const archiveRequestId = useRef<string | null>(null);
  const rollbackRequestId = useRef<string | null>(null);
  const draft = editorState?.draft ?? null;
  const currentVersion =
    editorState?.current?.version ?? selected?.version ?? null;
  const entityId = editorState?.current?.entityId ?? selected?.entityId ?? null;
  const entityType = editorState?.current?.entityType ?? selected?.entityType;

  const preview = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('DRAFT_REQUIRED');
      return repository.previewPublish({
        changeClassification,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
      });
    },
  });
  const archivePreview = useMutation({
    mutationFn: async () => {
      if (!entityId || !entityType || currentVersion === null)
        throw new Error('ENTITY_REQUIRED');
      return repository.previewArchive({
        entityId,
        entityType,
        expectedVersion: currentVersion,
      });
    },
  });
  const history = useMutation({
    mutationFn: async () => {
      if (!entityId || !entityType) throw new Error('ENTITY_REQUIRED');
      return repository.listHistory({ entityId, entityType });
    },
    onSuccess: (result) => {
      // Refresh authoritative content before leaving an unknown command state.
      // Until then, only an unchanged replay of the original receipt is safe.
      if (
        result.outcome === 'ok' &&
        (publish.isError || archive.isError || rollback.isError)
      )
        onChanged();
    },
  });
  const loadHistory = history.mutate;
  useEffect(() => {
    if (mode === 'history' && entityId && entityType) loadHistory();
  }, [entityId, entityType, loadHistory, mode]);
  const publish = useMutation({
    mutationFn: async () => {
      if (!draft || reason.trim().length < 10 || !confirmed)
        throw new Error('PUBLICATION_CONFIRMATION_REQUIRED');
      publishRequestId.current ??= crypto.randomUUID();
      return repository.publish({
        changeClassification,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
        reason: reason.trim(),
        requestId: publishRequestId.current,
      });
    },
    onSuccess: (result) => {
      publishRequestId.current = null;
      if (result.outcome === 'ok') onChanged();
    },
  });
  const archive = useMutation({
    mutationFn: async () => {
      if (
        !entityId ||
        !entityType ||
        currentVersion === null ||
        reason.trim().length < 10 ||
        !confirmed
      )
        throw new Error('ARCHIVE_CONFIRMATION_REQUIRED');
      archiveRequestId.current ??= crypto.randomUUID();
      return repository.archive({
        entityId,
        entityType,
        expectedVersion: currentVersion,
        reason: reason.trim(),
        requestId: archiveRequestId.current,
      });
    },
    onSuccess: (result) => {
      archiveRequestId.current = null;
      if (result.outcome === 'ok') onChanged();
    },
  });
  const rollback = useMutation({
    mutationFn: async () => {
      const targetVersion = Number(rollbackVersion);
      if (
        !entityId ||
        !entityType ||
        currentVersion === null ||
        !Number.isInteger(targetVersion) ||
        targetVersion <= 0 ||
        reason.trim().length < 10 ||
        !confirmed
      )
        throw new Error('ROLLBACK_CONFIRMATION_REQUIRED');
      rollbackRequestId.current ??= crypto.randomUUID();
      return repository.rollback({
        entityId,
        entityType,
        expectedVersion: currentVersion,
        reason: reason.trim(),
        requestId: rollbackRequestId.current,
        targetVersion,
      });
    },
    onSuccess: (result) => {
      rollbackRequestId.current = null;
      if (result.outcome === 'ok') onChanged();
    },
  });

  const historyEntries = useMemo(
    () => (history.data?.outcome === 'ok' ? history.data.entries : []),
    [history.data],
  );
  const rollbackOptions = useMemo(
    () =>
      historyEntries.filter(
        (entry) => entry.versionId !== null && entry.version !== currentVersion,
      ),
    [currentVersion, historyEntries],
  );
  const reasonReady = reason.trim().length >= 10;
  const commandPending =
    publish.isPending || archive.isPending || rollback.isPending;
  const commandUnknown = publish.isError || archive.isError || rollback.isError;
  const commandLocked = commandPending || commandUnknown;
  const denied =
    [
      preview.data,
      archivePreview.data,
      publish.data,
      archive.data,
      rollback.data,
      history.data,
    ].find((result) => result?.outcome === 'denied') ?? null;
  const completed =
    [publish.data, archive.data, rollback.data].find(
      (result) => result?.outcome === 'ok',
    ) ?? null;

  return (
    <section
      aria-label={mode === 'publication' ? '草稿發布確認' : '發布與版本歷史'}
      className="content-workflow"
    >
      <header>
        <h2>
          {mode === 'publication'
            ? '草稿發布確認'
            : mode === 'history'
              ? '版本歷史與封存'
              : '發布與版本歷史'}
        </h2>
        <p>影響由伺服器判定；發布、封存與回復都保留不可變事件。</p>
      </header>
      {!selected ? <p>請從上方清單選擇內容。</p> : null}
      {selected ? (
        <p className="content-workflow__hint">
          {selected.stableCode || '新草稿'}・目前版本{' '}
          {currentVersion === null ? '尚未發布' : String(currentVersion)}
        </p>
      ) : null}

      {draft && mode !== 'history' ? (
        <ContentDraftDiff
          current={editorState?.current?.payload ?? null}
          draft={draft.payload}
        />
      ) : null}

      <div className="content-workflow__actions">
        <button
          className="secondary-action"
          hidden={mode === 'history'}
          disabled={!draft || preview.isPending}
          onClick={() => {
            preview.mutate();
          }}
          type="button"
        >
          {preview.isPending ? '計算發布影響中…' : '預覽發布影響'}
        </button>
        <button
          className="secondary-action"
          hidden={
            mode === 'publication' ||
            editorState?.current?.status === 'archived'
          }
          disabled={
            !entityId || currentVersion === null || archivePreview.isPending
          }
          onClick={() => {
            archivePreview.mutate();
          }}
          type="button"
        >
          {archivePreview.isPending ? '計算封存影響中…' : '預覽封存影響'}
        </button>
        <button
          className="secondary-action"
          hidden={mode === 'publication' && !commandUnknown}
          disabled={!entityId || history.isPending || commandPending}
          onClick={() => {
            history.mutate();
          }}
          type="button"
        >
          {history.isPending
            ? '載入歷史中…'
            : commandUnknown
              ? '重新載入並核對版本歷史'
              : '查看版本歷史'}
        </button>
      </div>

      {preview.data?.outcome === 'ok' ? (
        <div className="content-workflow__result">
          <h3>發布前確認</h3>
          <p>
            版本 {preview.data.currentVersion ?? 0} → {preview.data.nextVersion}
          </p>
          <p>
            進度影響：<strong>{IMPACT_LABELS[preview.data.impact]}</strong>
          </p>
          <p>
            變更欄位：{preview.data.changedFields.join('、') || '建立新內容'}
          </p>
        </div>
      ) : null}

      {archivePreview.data?.outcome === 'ok' ? (
        <div className="content-workflow__result">
          <h3>封存前確認</h3>
          <p>
            版本 {archivePreview.data.currentVersion} →{' '}
            {archivePreview.data.nextVersion}
          </p>
          <p>
            受影響範圍：{selected?.stableCode}・
            <strong>{IMPACT_LABELS[archivePreview.data.impact]}</strong>
          </p>
          <p>變更欄位：狀態</p>
        </div>
      ) : null}

      {selected ? (
        <>
          <label hidden={mode === 'history'}>
            內容變更分類
            <select
              disabled={commandLocked}
              value={changeClassification}
              onChange={(event) => {
                setChangeClassification(
                  event.target.value as ChangeClassification,
                );
                setConfirmed(false);
                publishRequestId.current = null;
              }}
            >
              <option value="semantic">新增或語意變更（需重做）</option>
              <option value="nonsemantic">
                錯字、排版或無語意 accessibility 修正（保留進度）
              </option>
            </select>
          </label>
          <label>
            操作原因（至少 10 字）
            <textarea
              disabled={commandLocked}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                publishRequestId.current = null;
                archiveRequestId.current = null;
                rollbackRequestId.current = null;
              }}
            />
          </label>
          <label className="content-workflow__confirm">
            <input
              disabled={commandLocked}
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
              }}
              type="checkbox"
            />
            我已核對版本差異與學習進度影響
          </label>
          <div className="content-workflow__actions">
            <button
              className="primary-action"
              hidden={mode === 'history'}
              disabled={
                preview.data?.outcome !== 'ok' ||
                preview.data.draftId !== draft?.draftId ||
                preview.data.changeClassification !== changeClassification ||
                !reasonReady ||
                !confirmed ||
                commandPending ||
                archive.isError ||
                rollback.isError
              }
              onClick={() => {
                if (
                  window.confirm(
                    `第二次確認：發布 ${selected.stableCode}，${preview.data?.outcome === 'ok' ? IMPACT_LABELS[preview.data.impact] : '將更新學生端內容'}。確定發布嗎？`,
                  )
                )
                  publish.mutate();
              }}
              type="button"
            >
              {publish.isPending ? '發布中…' : '二次確認並發布'}
            </button>
            <button
              className="secondary-action"
              hidden={
                mode === 'publication' ||
                editorState?.current?.status === 'archived'
              }
              disabled={
                !entityId ||
                currentVersion === null ||
                archivePreview.data?.outcome !== 'ok' ||
                archivePreview.data.entityId !== entityId ||
                archivePreview.data.currentVersion !== currentVersion ||
                !reasonReady ||
                !confirmed ||
                commandPending ||
                publish.isError ||
                rollback.isError
              }
              onClick={() => {
                if (
                  window.confirm(
                    '確定下架此內容？歷史與學生紀錄會保留，學生將無法再讀取此內容。',
                  )
                )
                  archive.mutate();
              }}
              type="button"
            >
              {archive.isPending ? '封存中…' : '下架並封存內容'}
            </button>
          </div>
        </>
      ) : null}

      {history.data?.outcome === 'ok' ? (
        <div className="content-workflow__history">
          <h3>不可變版本事件</h3>
          {historyEntries.length === 0 ? <p>尚無發布事件。</p> : null}
          <ol>
            {historyEntries.map((entry) => (
              <li key={entry.eventId}>
                <strong>
                  v{entry.version}・{EVENT_LABELS[entry.eventType]}
                </strong>
                <span>{new Date(entry.createdAt).toLocaleString('zh-TW')}</span>
                <span>操作者 {entry.actorId}</span>
                <span>{entry.reason}</span>
                {entry.payload ? (
                  <details>
                    <summary>查看此版本內容</summary>
                    <ContentPayloadView payload={entry.payload} />
                  </details>
                ) : (
                  <span>此舊事件未保留可讀取的內容快照。</span>
                )}
                <span>
                  {IMPACT_LABELS[entry.impact]}・
                  {entry.changedFields.join('、') || '無欄位差異'}
                </span>
              </li>
            ))}
          </ol>
          {rollbackOptions.length > 0 ? (
            <div className="content-workflow__rollback">
              <label>
                回復來源版本
                <select
                  disabled={commandLocked}
                  value={rollbackVersion}
                  onChange={(event) => {
                    setRollbackVersion(event.target.value);
                  }}
                >
                  <option value="">請選擇</option>
                  {rollbackOptions.map((entry) => (
                    <option key={entry.eventId} value={entry.version}>
                      v{entry.version}・{EVENT_LABELS[entry.eventType]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-action"
                disabled={
                  rollbackVersion === '' ||
                  !reasonReady ||
                  !confirmed ||
                  commandPending ||
                  publish.isError ||
                  archive.isError
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `確定將 v${rollbackVersion} 回復為新版本？這不是刪除後續歷史。`,
                    )
                  )
                    rollback.mutate();
                }}
                type="button"
              >
                {rollback.isPending ? '建立回復版本中…' : '回復為新版本'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {denied?.outcome === 'denied' ? (
        <p role="alert">
          {denied.message}（{denied.code}）
        </p>
      ) : null}
      {preview.isError || archivePreview.isError || history.isError ? (
        <p role="alert">無法確認伺服器狀態；系統未自動重送。</p>
      ) : null}
      {publish.isError || archive.isError || rollback.isError ? (
        <p role="alert">
          操作結果未知；操作內容已鎖定。請先重新載入版本歷史，或以相同內容與原請求編號重送，不會建立第二筆操作。
        </p>
      ) : null}
      {completed?.outcome === 'ok' ? (
        <p role="status">
          操作完成：版本 {completed.version}・事件 {completed.eventId}
        </p>
      ) : null}
    </section>
  );
}
