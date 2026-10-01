import { useQueries, useQuery } from '@tanstack/react-query';
import type { ContentAuthoringRepository } from './api/content-authoring-repository';
import {
  flattenContentScope,
  type ContentStudioItem,
} from './lib/content-studio-model';
import { contentStudioKeys } from './query-keys';

export function useContentCatalog(repository: ContentAuthoringRepository) {
  const catalogQuery = useQuery({
    queryKey: [...contentStudioKeys.all, 'catalog'],
    queryFn: () => repository.listCatalog(),
  });
  const catalog =
    catalogQuery.data && 'chapters' in catalogQuery.data
      ? catalogQuery.data
      : null;
  const scopeQueries = useQueries({
    queries: (catalog?.chapters ?? []).map((chapter) => ({
      queryKey: contentStudioKeys.scope(chapter.chapterId),
      queryFn: () => repository.listScope({ chapterId: chapter.chapterId }),
    })),
  });
  const scopes = scopeQueries.flatMap((query) => {
    if (!query.data || !('chapter' in query.data)) return [];
    const data = query.data;
    const chapter = catalog?.chapters.find(
      (entry) => entry.chapterId === data.chapter.chapterId,
    );
    const course = catalog?.courses.find(
      (entry) => entry.courseId === chapter?.courseId,
    );
    return course ? [{ ...query.data, course }] : [];
  });
  const items = (() => {
    const entries = new Map<string, ContentStudioItem>();
    for (const scope of scopes)
      for (const item of flattenContentScope(scope)) {
        entries.set(
          `${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`,
          {
            ...item,
            ...(catalog?.drafts ? { draftId: null } : {}),
          },
        );
      }
    for (const draft of catalog?.drafts ?? []) {
      const key = `${draft.entityType}-${draft.entityId ?? draft.draftId}`;
      const current = entries.get(key);
      entries.set(key, {
        ...draft,
        status: current?.status ?? 'draft',
        version: current?.version ?? null,
      });
    }
    // Compatibility for preview harnesses and deployments before the queue migration.
    for (const draft of catalog?.hierarchyDrafts ?? []) {
      const key = `${draft.entityType}-${draft.draftId}`;
      if (!entries.has(key))
        entries.set(key, {
          ...draft,
          bankKind: null,
          chapterId: null,
          sectionId: null,
          subtopicId: null,
          parentId: null,
          parentType: null,
          title: draft.stableCode,
          status: 'draft',
          version: null,
        });
    }
    return [...entries.values()];
  })();
  return {
    catalog,
    scopes,
    items,
    loading:
      catalogQuery.isPending || scopeQueries.some((query) => query.isPending),
    error:
      catalogQuery.isError ||
      catalogQuery.data?.outcome === 'denied' ||
      scopeQueries.some(
        (query) => query.isError || query.data?.outcome === 'denied',
      ),
    retry: () => {
      void catalogQuery.refetch();
      scopeQueries.forEach((query) => {
        void query.refetch();
      });
    },
  };
}
