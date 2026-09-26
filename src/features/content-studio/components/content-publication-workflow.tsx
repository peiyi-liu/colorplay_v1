import { useMutation } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

import {
  createContentPublicationRepository,
  type ContentPublicationRepository,
} from '../api/content-publication-repository';
import type { ContentEditorState } from '../api/contracts';
import type { ChangeClassification } from '../api/content-publication-contracts';
import type { ContentStudioItem } from '../lib/content-studio-model';

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
  onChanged,
  repository = createContentPublicationRepository(),
  selected,
}: Readonly<{
  editorState: ContentEditorState | null;
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
  });
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
    <section aria-label="發布與版本歷史" className="content-workflow">
      <header>
        <h2>發布與版本歷史</h2>
        <p>影響由伺服器判定；發布、封存與回復都保留不可變事件。</p>
      </header>
      {!selected ? <p>先在工作區選取內容。</p> : null}
      {selected ? (
        <p className="content-workflow__hint">
          {selected.stableCode || '新草稿'}・目前版本{' '}
          {currentVersion === null ? '尚未發布' : String(currentVersion)}
        </p>
      ) : null}

      <div className="content-workflow__actions">
        <button
          className="secondary-action"
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
          disabled={!entityId || history.isPending}
          onClick={() => {
            history.mutate();
          }}
          type="button"
        >
          {history.isPending ? '載入歷史中…' : '查看版本歷史'}
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
          <label>
            內容變更分類
            <select
              value={changeClassification}
              onChange={(event) => {
                setChangeClassification(
                  event.target.value as ChangeClassification,
                );
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
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </label>
          <label className="content-workflow__confirm">
            <input
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
              disabled={
                preview.data?.outcome !== 'ok' ||
                preview.data.draftId !== draft?.draftId ||
                preview.data.changeClassification !== changeClassification ||
                !reasonReady ||
                !confirmed ||
                publish.isPending
              }
              onClick={() => {
                publish.mutate();
              }}
              type="button"
            >
              {publish.isPending ? '發布中…' : '二次確認並發布'}
            </button>
            <button
              className="secondary-action"
              disabled={
                !entityId ||
                currentVersion === null ||
                archivePreview.data?.outcome !== 'ok' ||
                archivePreview.data.entityId !== entityId ||
                archivePreview.data.currentVersion !== currentVersion ||
                !reasonReady ||
                !confirmed ||
                archive.isPending
              }
              onClick={() => {
                archive.mutate();
              }}
              type="button"
            >
              {archive.isPending ? '封存中…' : '封存目前版本'}
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
                  rollback.isPending
                }
                onClick={() => {
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
          操作結果未知；請先重新載入版本歷史，確認後再決定是否重送。
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
