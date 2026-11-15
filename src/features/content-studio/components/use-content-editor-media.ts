import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  createContentMediaRepository,
  ContentMediaRepositoryError,
  type ContentMediaRepository,
} from '../api/content-media-repository';
import type {
  ContentMediaAsset,
  ContentMediaSemanticRole,
} from '../api/content-media-contracts';
interface UploadContext {
  requestId: string;
  repository: ContentMediaRepository;
  file: File;
  altText: string;
  role: ContentMediaSemanticRole;
}
export const useContentEditorMedia = (
  supplied: ContentMediaRepository | undefined,
  onInsert: (asset: ContentMediaAsset, altText: string) => void,
  onNotice: (notice: string) => void,
) => {
  const [fallback] = useState(createContentMediaRepository);
  const repository = supplied ?? fallback;
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [role, setRole] = useState<ContentMediaSemanticRole>('standard');
  const [uncertain, setUncertain] = useState(false);
  const [fileEpoch, setFileEpoch] = useState(0);
  const busy = useRef(false);
  const pending = useRef(false);
  const context = useRef<UploadContext | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: 'upload' | 'recover' | 'cancel') => {
      const owned = context.current;
      if (!owned) throw new Error('IMAGE_REQUIRED');
      if (action === 'recover')
        return owned.repository.recover(owned.requestId);
      if (action === 'cancel') {
        await owned.repository.cancel(owned.requestId);
        return null;
      }
      return owned.repository.uploadAndProcess({
        file: owned.file,
        requestId: owned.requestId,
        semanticRole: owned.role,
      });
    },
    onError: (error, action) => {
      if (
        action !== 'upload' ||
        (error instanceof ContentMediaRepositoryError &&
          error.code === 'CONTENT_MEDIA_PENDING')
      ) {
        pending.current = true;
        setUncertain(true);
        onNotice('尚未確認伺服器結果，請選擇恢復或取消。');
      } else onNotice('圖片處理失敗；原圖不會加入內容。');
    },
    onSuccess: (asset) => {
      const owned = context.current;
      if (asset && owned) onInsert(asset, owned.altText);
      pending.current = false;
      setUncertain(false);
      context.current = null;
      setFile(null);
      setAltText('');
      setFileEpoch((value) => value + 1);
      onNotice(
        asset
          ? '圖片已壓縮為 WebP 並加入表單；儲存草稿後才會套用。'
          : '已確認取消這次上傳，可以重新選擇圖片。',
      );
    },
    onSettled: () => {
      busy.current = false;
    },
  });
  const run = (action: 'upload' | 'recover' | 'cancel') => {
    if (
      busy.current ||
      (action === 'upload' ? pending.current : !pending.current)
    )
      return;
    if (action === 'upload') {
      if (!file || !altText.trim()) return;
      context.current = {
        requestId: context.current?.requestId ?? crypto.randomUUID(),
        repository,
        file,
        altText: altText.trim(),
        role,
      };
    }
    if (!context.current) return;
    busy.current = true;
    mutation.mutate(action);
  };
  return {
    file,
    altText,
    role,
    fileEpoch,
    uncertain,
    isUploading: mutation.isPending,
    locked: uncertain || mutation.isPending,
    onFileChange: (value: File | null) => {
      if (!busy.current && !pending.current) {
        context.current = null;
        setFile(value);
      }
    },
    onAltTextChange: (value: string) => {
      if (!busy.current && !pending.current) setAltText(value);
    },
    onRoleChange: (value: ContentMediaSemanticRole) => {
      if (!busy.current && !pending.current) setRole(value);
    },
    onUpload: () => {
      run('upload');
    },
    onRecover: () => {
      run('recover');
    },
    onCancel: () => {
      run('cancel');
    },
  };
};
