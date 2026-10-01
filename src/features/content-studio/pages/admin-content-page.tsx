import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileClock, FileUp, List, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageLoading } from '../../admin/components/admin-page-loading';
import {
  createContentAuthoringRepository,
  type ContentAuthoringRepository,
} from '../api/content-authoring-repository';
import type { ContentMediaRepository } from '../api/content-media-repository';
import type { ContentPublicationRepository } from '../api/content-publication-repository';
import type { ContentEntityType } from '../api/contracts';
import { ContentEditorForm } from '../components/content-editor-form';
import { ContentImportWorkflow } from '../components/content-import-workflow';
import { ContentList } from '../components/content-list';
import { ContentLifecycleList } from '../components/content-lifecycle-list';
import { ContentPublicationWorkflow } from '../components/content-publication-workflow';
import type { ContentImportRepository } from '../import/content-import-repository';
import {
  createNewContentItem,
  type ContentStudioItem,
} from '../lib/content-studio-model';
import { contentStudioKeys } from '../query-keys';
import { useContentCatalog } from '../use-content-catalog';
import '../../../styles/content-studio.css';

const CHAPTER_3_ID = '21000000-0000-0000-0000-000000000003';
type StudioView = 'list' | 'editor' | 'import' | 'publication' | 'history';

export function AdminContentPage({
  importRepository,
  mediaRepository,
  publicationRepository,
  repository = createContentAuthoringRepository(),
}: Readonly<{
  importRepository?: ContentImportRepository | undefined;
  mediaRepository?: ContentMediaRepository | undefined;
  publicationRepository?: ContentPublicationRepository | undefined;
  repository?: ContentAuthoringRepository;
}>) {
  const queryClient = useQueryClient();
  const { catalog, scopes, items, loading, error, retry } =
    useContentCatalog(repository);
  const [view, setView] = useState<StudioView>('list');
  const [selected, setSelected] = useState<ContentStudioItem | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState(CHAPTER_3_ID);
  const [editorChapterId, setEditorChapterId] = useState(CHAPTER_3_ID);
  const scope =
    scopes.find((entry) => entry.chapter.chapterId === chapterId) ?? scopes[0];
  const editorScope =
    scopes.find((entry) => entry.chapter.chapterId === editorChapterId) ??
    scope;
  const newItem = (entityType: ContentEntityType): ContentStudioItem => ({
    ...createNewContentItem(entityType, null),
    chapterId: editorScope?.chapter.chapterId ?? null,
    parentId:
      entityType === 'chapter' ? (editorScope?.course.courseId ?? null) : null,
    parentType: entityType === 'chapter' ? 'course' : null,
  });
  const confirmLeave = useCallback(
    () =>
      !dirty ||
      window.confirm('尚有未儲存變更，離開會捨棄這些變更。確定繼續嗎？'),
    [dirty],
  );
  const openView = (next: StudioView) => {
    if (!confirmLeave()) return;
    setDirty(false);
    setSelected(null);
    setNotice(null);
    setView(next);
  };
  const openEditor = (item: ContentStudioItem) => {
    if (!confirmLeave()) return;
    setSelected(item);
    setEditorChapterId(item.chapterId ?? CHAPTER_3_ID);
    setDirty(false);
    setNotice(null);
    setView('editor');
  };
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);
  const needsEditor =
    selected !== null &&
    (selected.entityId !== null || selected.draftId !== null);
  const editorQuery = useQuery({
    enabled: needsEditor,
    queryFn: () =>
      repository.readEditorState({
        draftId: selected?.draftId ?? null,
        entityId: selected?.entityId ?? null,
        entityType: selected?.entityType ?? 'review_card',
      }),
    queryKey: selected
      ? contentStudioKeys.editor(
          selected.entityType,
          selected.entityId,
          selected.draftId,
        )
      : [...contentStudioKeys.all, 'editor', 'none'],
  });
  const editorState =
    editorQuery.data && 'current' in editorQuery.data ? editorQuery.data : null;
  const refreshContent = () => {
    void queryClient.invalidateQueries({ queryKey: contentStudioKeys.all });
  };
  if (loading) return <AdminPageLoading title="內容工作台" onRetry={retry} />;
  if (error || !catalog || !scope || !editorScope)
    return (
      <section className="page-wide page-stack">
        <h1>內容工作台</h1>
        <p role="alert">內容資料載入失敗，請稍後重試。</p>
        <button className="secondary-action" type="button" onClick={retry}>
          重試
        </button>
      </section>
    );

  return (
    <section
      aria-labelledby="content-studio-heading"
      className="content-studio page-wide page-stack"
    >
      <header className="content-studio__heading">
        <div>
          <h1 id="content-studio-heading">內容工作台</h1>
          <p>清單與學生共用正式資料來源；修改先存草稿，發布後才更新學生端。</p>
        </div>
        <nav aria-label="內容工作台功能" className="content-studio__nav">
          {(
            [
              ['list', List, '清單'],
              ['import', FileUp, '外部匯入'],
              ['publication', Send, '發布'],
              ['history', FileClock, '歷史'],
            ] as const
          ).map(([next, Icon, label]) => (
            <button
              type="button"
              key={next}
              aria-pressed={view === next}
              onClick={() => {
                openView(next);
              }}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </header>
      {notice ? (
        <p className="content-studio__notice" role="status">
          {notice}
        </p>
      ) : null}
      {view === 'list' ? (
        <ContentList
          catalog={catalog}
          chapterId={scope.chapter.chapterId}
          items={items}
          scope={scope}
          onChapterChange={setChapterId}
          onEdit={openEditor}
          onNew={() => {
            setEditorChapterId(CHAPTER_3_ID);
            openEditor({
              ...createNewContentItem('review_card', null),
              chapterId: CHAPTER_3_ID,
            });
          }}
        />
      ) : null}
      {view === 'import' ? (
        <ContentImportWorkflow
          repository={importRepository}
          mediaRepository={mediaRepository}
          onCommitted={refreshContent}
        />
      ) : null}
      {view === 'publication' || view === 'history' ? (
        <>
          <ContentLifecycleList
            key={view}
            mode={view}
            items={items}
            onSelect={setSelected}
          />
          {selected && editorState ? (
            <ContentPublicationWorkflow
              editorState={editorState}
              mode={view}
              key={`${view}-${selected.entityType}-${selected.entityId ?? selected.draftId ?? 'new'}-${String(editorState.draft?.revision ?? 0)}-${String(editorState.current?.version ?? 0)}`}
              selected={selected}
              repository={publicationRepository}
              onChanged={() => {
                setSelected(null);
                setNotice('操作完成，清單與版本紀錄已更新。');
                refreshContent();
              }}
            />
          ) : null}
        </>
      ) : null}
      {selected && needsEditor && editorQuery.isPending ? (
        <p role="status">正在載入編輯資料…</p>
      ) : null}
      {selected && editorQuery.data?.outcome === 'denied' ? (
        <p role="alert">{editorQuery.data.message}</p>
      ) : null}
      {selected && editorQuery.isError ? (
        <div className="content-studio__error">
          <p role="alert">編輯資料載入失敗。</p>
          <button
            className="secondary-action"
            type="button"
            onClick={() => void editorQuery.refetch()}
          >
            重新載入
          </button>
        </div>
      ) : null}
      {view === 'editor' && selected && (!needsEditor || editorState) ? (
        <section
          aria-label="內容編輯工作區"
          className="content-studio__editor-page"
        >
          <ContentEditorForm
            allItems={items}
            catalog={catalog}
            item={selected}
            key={`${selected.entityType}-${selected.entityId ?? selected.draftId ?? 'new'}-${String(editorState?.draft?.revision ?? 0)}`}
            mediaRepository={mediaRepository}
            onCancel={() => {
              openView('list');
            }}
            onChapterChange={setEditorChapterId}
            onCreated={() => {
              setDirty(false);
              setSelected(null);
              setChapterId(editorChapterId);
              setNotice('內容已儲存，可在清單中確認。');
              setView('list');
              refreshContent();
            }}
            onDirtyChange={setDirty}
            onNewTypeChange={(type) => {
              if (confirmLeave()) {
                setDirty(false);
                setSelected(newItem(type));
              }
            }}
            onOpenLifecycle={() => {
              if (!confirmLeave()) return;
              setDirty(false);
              setView('history');
            }}
            onReload={() => editorQuery.refetch()}
            repository={repository}
            scope={editorScope}
            state={editorState}
          />
        </section>
      ) : null}
    </section>
  );
}

export const Component = AdminContentPage;
