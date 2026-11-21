import {
  ContentMediaRepositoryError,
  type ContentMediaRepository,
} from '../api/content-media-repository';
import { inspectContentImportMedia } from './package-media';

export type ImportMediaProgress = Readonly<{
  path: string;
  status: 'pending' | 'processing' | 'verified';
}>;

export function createContentImportMediaBatch(
  repository: ContentMediaRepository,
) {
  interface Entry {
    requestId: string;
    assetId: string | null;
    pending: boolean;
  }
  const entries = new Map<string, Entry>();
  let busy = false;
  const pendingError = () =>
    new ContentMediaRepositoryError('CONTENT_MEDIA_PENDING');
  const reset = () => {
    if (busy || [...entries.values()].some((entry) => entry.pending))
      throw pendingError();
    entries.clear();
  };
  return {
    reset,
    async cancel() {
      if (busy) throw pendingError();
      const pending = [...entries.values()].filter((entry) => entry.pending);
      if (pending.length === 0) throw pendingError();
      busy = true;
      try {
        for (const entry of pending) {
          await repository.cancel(entry.requestId);
          entry.pending = false;
        }
      } finally {
        busy = false;
      }
      // Clearing references never deletes previously verified, immutable assets.
      reset();
    },
    async process(
      file: File,
      recover: boolean,
      onProgress: (value: readonly ImportMediaProgress[]) => void,
    ) {
      if (busy) throw pendingError();
      busy = true;
      try {
        const media = await inspectContentImportMedia(file);
        const progress = () => {
          onProgress(
            media.map((item) => ({
              path: item.path,
              status: entries.get(item.path)?.assetId ? 'verified' : 'pending',
            })),
          );
        };
        progress();
        for (const item of media) {
          let entry = entries.get(item.path);
          if (entry?.assetId) continue;
          if (!entry) {
            entry = {
              requestId: crypto.randomUUID(),
              assetId: null,
              pending: false,
            };
            entries.set(item.path, entry);
          }
          if (entry.pending && !recover) throw pendingError();
          onProgress(
            media.map((value) => ({
              path: value.path,
              status: entries.get(value.path)?.assetId
                ? 'verified'
                : value.path === item.path
                  ? 'processing'
                  : 'pending',
            })),
          );
          try {
            const asset = entry.pending
              ? await repository.recover(entry.requestId)
              : await repository.uploadAndProcess({
                  file: item.file,
                  requestId: entry.requestId,
                  semanticRole: item.semanticRole,
                });
            entry.assetId = asset.assetId;
            entry.pending = false;
          } catch (error) {
            if (
              error instanceof ContentMediaRepositoryError &&
              error.code === 'CONTENT_MEDIA_PENDING'
            )
              entry.pending = true;
            throw error;
          }
          progress();
        }
        return Object.fromEntries(
          [...entries].flatMap(([path, entry]) =>
            entry.assetId ? [[path, entry.assetId]] : [],
          ),
        );
      } finally {
        busy = false;
      }
    },
  };
}
