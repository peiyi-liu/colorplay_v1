import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  createContentImportRepository,
  type ContentImportRepository,
} from '../import/content-import-repository';
import { createContentImportTemplate } from '../import/content-import-template';
import {
  createContentMediaRepository,
  ContentMediaRepositoryError,
  type ContentMediaRepository,
} from '../api/content-media-repository';
import {
  createContentImportMediaBatch,
  type ImportMediaProgress,
} from '../import/package-media-batch';

const readableIssue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return [record.field, record.code, record.message]
      .filter((item): item is string => typeof item === 'string')
      .join(' · ');
  }
  return '未分類的資料錯誤';
};

export function ContentImportWorkflow({
  onCommitted,
  repository: suppliedRepository,
  mediaRepository,
}: Readonly<{
  mediaRepository?: ContentMediaRepository | undefined;
  onCommitted: () => void;
  repository?: ContentImportRepository | undefined;
}>) {
  const [fallbackRepository] = useState(createContentImportRepository);
  const repository = suppliedRepository ?? fallbackRepository;
  const [fallbackMediaRepository] = useState(createContentMediaRepository);
  const [mediaBatch] = useState(() =>
    createContentImportMediaBatch(mediaRepository ?? fallbackMediaRepository),
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileEpoch, setFileEpoch] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const actionBusy = useRef(false);
  const [confirmWarnings, setConfirmWarnings] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<
    readonly ImportMediaProgress[]
  >([]);
  const requestId = useRef<string | null>(null);
  const commitRequestId = useRef<string | null>(null);
  const preview = useMutation({
    mutationFn: async (action: 'preview' | 'recover' | 'cancel') => {
      if (action === 'cancel') {
        await mediaBatch.cancel();
        requestId.current = null;
        commitRequestId.current = null;
        setFile(null);
        setFileEpoch((value) => value + 1);
        setMediaProgress([]);
        return null;
      }
      if (!file) throw new Error('FILE_REQUIRED');
      requestId.current ??= crypto.randomUUID();
      const mediaManifestMap = await mediaBatch.process(
        file,
        action === 'recover',
        setMediaProgress,
      );
      setUncertain(false);
      return repository.previewPackage({
        file,
        mediaManifestMap,
        requestId: requestId.current,
      });
    },
    onError: (error) => {
      if (
        error instanceof ContentMediaRepositoryError &&
        error.code === 'CONTENT_MEDIA_PENDING'
      )
        setUncertain(true);
    },
    onSuccess: () => {
      setUncertain(false);
    },
    onSettled: () => {
      actionBusy.current = false;
    },
  });
  const runPreviewAction = (action: 'preview' | 'recover' | 'cancel') => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    preview.mutate(action);
  };
  const commit = useMutation({
    mutationFn: async () => {
      if (!preview.data) throw new Error('PREVIEW_REQUIRED');
      commitRequestId.current ??= crypto.randomUUID();
      return repository.commitDrafts({
        confirmWarnings,
        requestId: commitRequestId.current,
        runId: preview.data.run_id,
      });
    },
    onSuccess: () => {
      onCommitted();
    },
  });

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([createContentImportTemplate()], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'colorplay-content-template.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="內容匯入流程" className="content-workflow">
      <header>
        <h2>外部內容匯入</h2>
        <p>上傳 → 可信驗證 → 差異預覽 → 建立草稿；不會直接發布。</p>
      </header>
      <button
        className="secondary-action"
        type="button"
        onClick={downloadTemplate}
      >
        下載 XLSX 範本
      </button>
      <label>
        內容套件（XLSX 或 CSV＋圖片 ZIP）
        <input
          key={fileEpoch}
          accept=".xlsx,.zip"
          disabled={uncertain || preview.isPending}
          type="file"
          onChange={(event) => {
            if (uncertain || actionBusy.current) return;
            mediaBatch.reset();
            setFile(event.target.files?.[0] ?? null);
            requestId.current = null;
            commitRequestId.current = null;
            setMediaProgress([]);
            preview.reset();
            commit.reset();
          }}
        />
      </label>
      <p className="content-workflow__hint">
        ZIP 內圖片會自動逐張進入可信壓縮流程，再由 Edge 核對原檔 SHA-256 與
        manifest；不需手動貼 UUID。
      </p>
      <button
        className="primary-action"
        disabled={!file || preview.isPending || uncertain}
        type="button"
        onClick={() => {
          runPreviewAction('preview');
        }}
      >
        {preview.isPending ? '可信驗證中…' : '上傳並預覽差異'}
      </button>
      {mediaProgress.length > 0 ? (
        <ul aria-label="匯入圖片處理進度">
          {mediaProgress.map((item) => (
            <li key={item.path}>
              {item.path}：
              {item.status === 'pending'
                ? '等待中'
                : item.status === 'processing'
                  ? '壓縮驗證中'
                  : '已驗證'}
            </li>
          ))}
        </ul>
      ) : null}
      {uncertain ? (
        <div>
          <p role="alert">
            圖片處理結果尚未確認；請確認並恢復處理，或取消這次上傳後重新選擇
            ZIP。已驗證圖片不會被刪除。
          </p>
          <button
            type="button"
            disabled={preview.isPending}
            onClick={() => {
              runPreviewAction('recover');
            }}
          >
            確認並恢復處理
          </button>
          <button
            type="button"
            disabled={preview.isPending}
            onClick={() => {
              runPreviewAction('cancel');
            }}
          >
            取消這次上傳
          </button>
        </div>
      ) : null}
      {preview.isError && !uncertain ? (
        <p role="alert">套件驗證失敗；尚未建立任何草稿。</p>
      ) : null}
      {preview.data ? (
        <div className="content-workflow__result">
          <p role="status">
            總計 {preview.data.items.length}・有效{' '}
            {preview.data.items.length - preview.data.error_count}・新增{' '}
            {preview.data.create_count}・更新 {preview.data.update_count}・不變{' '}
            {preview.data.no_op_count}・警告 {preview.data.warning_count}・錯誤{' '}
            {preview.data.error_count}
          </p>
          <div className="ui-table-scroll">
            <table aria-label="匯入差異" className="ui-table">
              <thead>
                <tr>
                  <th>來源</th>
                  <th>代碼</th>
                  <th>類型</th>
                  <th>結果</th>
                  <th>問題</th>
                </tr>
              </thead>
              <tbody>
                {preview.data.items.map((item) => (
                  <tr
                    key={`${item.sheet}-${String(item.row_number)}-${item.entity_type}-${item.stable_code}`}
                  >
                    <td>
                      {item.sheet} 第 {item.row_number} 列
                    </td>
                    <td>{item.stable_code}</td>
                    <td>{item.entity_type}</td>
                    <td>{item.disposition}</td>
                    <td>
                      {[...item.issues, ...(item.warnings ?? [])]
                        .map(readableIssue)
                        .join('；') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.data.warning_count > 0 ? (
            <label className="content-workflow__confirm">
              <input
                checked={confirmWarnings}
                type="checkbox"
                onChange={(event) => {
                  setConfirmWarnings(event.target.checked);
                }}
              />
              我已逐項檢查 {preview.data.warning_count} 個警告
            </label>
          ) : null}
          <button
            className="primary-action"
            disabled={
              preview.data.error_count > 0 ||
              (preview.data.warning_count > 0 && !confirmWarnings) ||
              commit.isPending
            }
            type="button"
            onClick={() => {
              commit.mutate();
            }}
          >
            {commit.isPending ? '建立草稿中…' : '確認並建立草稿'}
          </button>
        </div>
      ) : null}
      {commit.data ? (
        <p role="status">
          匯入完成：已建立或更新 {commit.data.results.length} 份草稿。
        </p>
      ) : null}
      {commit.isError ? (
        <p role="alert">
          匯入 commit 失敗；請重新取得 preview，避免使用過期差異。
        </p>
      ) : null}
    </section>
  );
}
