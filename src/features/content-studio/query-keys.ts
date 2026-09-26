export const contentStudioKeys = {
  all: ['admin', 'content-studio'] as const,
  editor: (
    entityType: string,
    entityId: string | null,
    draftId: string | null,
  ) =>
    [
      ...contentStudioKeys.all,
      'editor',
      entityType,
      entityId,
      draftId,
    ] as const,
  scope: (chapterId: string) =>
    [...contentStudioKeys.all, 'scope', chapterId] as const,
};
