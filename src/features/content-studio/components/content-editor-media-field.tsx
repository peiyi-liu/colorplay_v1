import { ImagePlus, Trash2 } from 'lucide-react';

import type { EditorValues } from './content-editor-form-model';

type MediaEntry = EditorValues['media'][number];

export function ContentEditorMediaField({
  altText,
  file,
  isUploading,
  uncertain,
  locked,
  fileEpoch,
  onRecover,
  onCancel,
  media,
  onAltTextChange,
  onFileChange,
  onRemove,
  onRoleChange,
  onUpload,
  role,
}: Readonly<{
  altText: string;
  file: File | null;
  isUploading: boolean;
  uncertain: boolean;
  locked: boolean;
  fileEpoch: number;
  onRecover: () => void;
  onCancel: () => void;
  media: readonly MediaEntry[];
  onAltTextChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onRemove: (index: number) => void;
  onRoleChange: (role: 'standard' | 'color_critical') => void;
  onUpload: () => void;
  role: 'standard' | 'color_critical';
}>) {
  return (
    <fieldset className="content-editor__media">
      <legend>內容圖片（最多 3 張）</legend>
      <p>上傳後會驗證格式並建立壓縮 WebP；草稿只保存圖片識別碼。</p>
      {media.map((entry, index) => (
        <div className="content-editor__media-entry" key={entry.manifest_id}>
          <div>
            <strong>{entry.alt_text}</strong>
            <code>content-media:{entry.manifest_id}</code>
          </div>
          <button
            aria-label={`移除圖片 ${entry.alt_text}`}
            disabled={locked}
            className="secondary-action"
            onClick={() => {
              onRemove(index);
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" /> 移除
          </button>
        </div>
      ))}
      {uncertain ? (
        <div>
          <p role="alert">
            圖片處理結果尚未確認；請沿原操作確認並恢復，或明確取消這次上傳。
          </p>
          <button
            className="secondary-action"
            disabled={isUploading}
            onClick={onRecover}
            type="button"
          >
            確認並恢復處理
          </button>
          <button
            className="secondary-action"
            disabled={isUploading}
            onClick={onCancel}
            type="button"
          >
            取消這次上傳
          </button>
        </div>
      ) : null}
      {media.length < 3 ? (
        <div className="content-editor__media-upload">
          <label>
            圖片檔案
            <input
              key={fileEpoch}
              disabled={locked}
              accept="image/jpeg,image/png,image/webp"
              type="file"
              onChange={(event) => {
                onFileChange(event.target.files?.[0] ?? null);
              }}
            />
          </label>
          <label>
            替代文字
            <input
              disabled={locked}
              value={altText}
              onChange={(event) => {
                onAltTextChange(event.target.value);
              }}
            />
          </label>
          <label>
            圖片用途
            <select
              disabled={locked}
              value={role}
              onChange={(event) => {
                onRoleChange(
                  event.target.value as 'standard' | 'color_critical',
                );
              }}
            >
              <option value="standard">一般教學圖片</option>
              <option value="color_critical">色彩精準圖片</option>
            </select>
          </label>
          <button
            className="secondary-action"
            disabled={!file || !altText.trim() || locked}
            onClick={onUpload}
            type="button"
          >
            <ImagePlus aria-hidden="true" />
            {isUploading ? '壓縮處理中…' : '插入圖片'}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
