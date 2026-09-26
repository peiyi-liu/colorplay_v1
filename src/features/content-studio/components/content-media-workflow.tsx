import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { ContentAuthoringRepository } from '../api/content-authoring-repository';
import {
  createContentMediaRepository,
  type ContentMediaRepository,
} from '../api/content-media-repository';
import type { ContentEditorState } from '../api/contracts';
import type { ContentStudioItem } from '../lib/content-studio-model';

export function ContentMediaWorkflow({
  authoringRepository,
  editorState,
  mediaRepository = createContentMediaRepository(),
  onAttached,
  selected,
}: Readonly<{
  authoringRepository: ContentAuthoringRepository;
  editorState: ContentEditorState | null;
  mediaRepository?: ContentMediaRepository | undefined;
  onAttached: () => void;
  selected: ContentStudioItem | null;
}>) {
  const [file, setFile] = useState<File | null>(null);
  const [semanticRole, setSemanticRole] = useState<
    'standard' | 'color_critical'
  >('standard');
  const [altText, setAltText] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const uploadRequest = useRef<string | null>(null);
  const attachRequest = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('FILE_REQUIRED');
      uploadRequest.current ??= crypto.randomUUID();
      return mediaRepository.uploadAndProcess({
        file,
        requestId: uploadRequest.current,
        semanticRole,
      });
    },
  });
  const attach = useMutation({
    mutationFn: async () => {
      if (
        !upload.data ||
        selected?.entityType !== 'review_card' ||
        !altText.trim()
      )
        throw new Error('ATTACH_INPUT_INVALID');
      const source = editorState?.draft ?? editorState?.current;
      if (!source) throw new Error('EDITOR_STATE_REQUIRED');
      const existing: readonly unknown[] = Array.isArray(source.payload.media)
        ? (source.payload.media as readonly unknown[])
        : [];
      attachRequest.current ??= crypto.randomUUID();
      return authoringRepository.saveDraft({
        draftId: editorState?.draft?.draftId ?? null,
        entityId: selected.entityId,
        entityType: 'review_card',
        expectedRevision: editorState?.draft?.revision ?? 0,
        payload: {
          ...source.payload,
          media: [
            ...existing,
            {
              alt_text: altText.trim(),
              manifest_id: upload.data.assetId,
              semantic_role: upload.data.semanticRole,
              sort_order: sortOrder,
            },
          ],
        },
        requestId: attachRequest.current,
        source: 'manual',
        stableCode: source.stableCode,
      });
    },
    onSuccess: (result) => {
      if (result.outcome === 'ok') onAttached();
    },
  });
  const canAttach =
    selected?.entityType === 'review_card' && editorState !== null;

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  return (
    <section aria-label="圖片處理流程" className="content-workflow">
      <header>
        <h2>圖片壓縮與驗證</h2>
        <p>原檔只進 quarantine；完成後產生不可變 WebP manifest。</p>
      </header>
      <label>
        圖片（JPG、PNG、WebP；最多 2 MiB）
        <input
          accept="image/jpeg,image/png,image/webp"
          type="file"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            setFile(nextFile);
            if (previewUrlRef.current)
              URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current =
              nextFile && typeof URL.createObjectURL === 'function'
                ? URL.createObjectURL(nextFile)
                : null;
            setPreviewUrl(previewUrlRef.current);
            uploadRequest.current = null;
            attachRequest.current = null;
            upload.reset();
            attach.reset();
          }}
        />
      </label>
      {previewUrl ? (
        <figure className="content-workflow__image-preview">
          <img alt="待處理原圖預覽" src={previewUrl} />
          <figcaption>
            僅供操作前預覽；正式內容只採用伺服器驗證後的 manifest。
          </figcaption>
        </figure>
      ) : null}
      <label>
        用途
        <select
          value={semanticRole}
          onChange={(event) => {
            setSemanticRole(event.target.value as typeof semanticRole);
          }}
        >
          <option value="standard">一般教學圖片</option>
          <option value="color_critical">色彩精準圖片</option>
        </select>
      </label>
      <button
        className="primary-action"
        disabled={!file || upload.isPending}
        type="button"
        onClick={() => {
          upload.mutate();
        }}
      >
        {upload.isPending ? '壓縮驗證中…' : '上傳並建立 WebP 衍生檔'}
      </button>
      {upload.isError ? (
        <p role="alert">圖片處理失敗；不合格圖片不會進入正式內容。</p>
      ) : null}
      {upload.data ? (
        <div className="content-workflow__result">
          <p role="status">
            圖片已驗證：{upload.data.width}×{upload.data.height}，
            {upload.data.variants.length} 個 WebP 衍生檔。
          </p>
          <code>content-media:{upload.data.assetId}</code>
          <ul>
            {upload.data.variants.map((variant) => (
              <li key={variant.kind}>
                {variant.kind}：{variant.width}×{variant.height}・
                {Math.ceil(variant.bytes / 1024)} KiB
              </li>
            ))}
          </ul>
          <label>
            替代文字
            <input
              disabled={attach.isPending}
              value={altText}
              onChange={(event) => {
                setAltText(event.target.value);
                attachRequest.current = null;
                attach.reset();
              }}
            />
          </label>
          <label>
            顯示順序
            <input
              disabled={attach.isPending}
              min={0}
              type="number"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(Number(event.target.value));
                attachRequest.current = null;
                attach.reset();
              }}
            />
          </label>
          <button
            className="secondary-action"
            disabled={
              !canAttach ||
              !altText.trim() ||
              !Number.isInteger(sortOrder) ||
              sortOrder < 0 ||
              attach.isPending
            }
            type="button"
            onClick={() => {
              attach.mutate();
            }}
          >
            加入目前複習卡草稿
          </button>
          {!canAttach ? (
            <p className="content-workflow__hint">
              先在工作區選取一張複習卡，才能套用圖片。
            </p>
          ) : null}
        </div>
      ) : null}
      {attach.data?.outcome === 'ok' ? (
        <p role="status">
          圖片已加入草稿（修訂 {attach.data.draft.revision}）。
        </p>
      ) : null}
      {attach.data?.outcome === 'denied' ? (
        <p role="alert">{attach.data.message}</p>
      ) : null}
      {attach.isError ? (
        <p role="alert">圖片已處理，但加入草稿失敗；manifest 仍可安全重用。</p>
      ) : null}
    </section>
  );
}
