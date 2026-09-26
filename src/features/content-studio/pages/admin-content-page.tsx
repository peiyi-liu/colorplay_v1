import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  FileClock,
  FileUp,
  List,
  Plus,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminPageLoading } from '../../admin/components/admin-page-loading';
import {
  createContentAuthoringRepository,
  type ContentAuthoringRepository,
} from '../api/content-authoring-repository';
import type { ContentMediaRepository } from '../api/content-media-repository';
import type { ContentPublicationRepository } from '../api/content-publication-repository';
import type { ContentEntityType } from '../api/contracts';
import { ContentEditorForm } from '../components/content-editor-form';
import { ContentOperatorWorkflows } from '../components/content-operator-workflows';
import type { ContentImportRepository } from '../import/content-import-repository';
import {
  CONTENT_ENTITY_LABELS,
  createNewContentItem,
  flattenContentScope,
  type ContentStudioItem,
} from '../lib/content-studio-model';
import { contentStudioKeys } from '../query-keys';
import '../../../styles/content-studio.css';

const CHAPTER_3_ID = '21000000-0000-0000-0000-000000000003';
const PAGE_SIZE = 12;
const ENTITY_TYPES = Object.keys(CONTENT_ENTITY_LABELS) as ContentEntityType[];
type StudioView = 'list' | 'editor' | 'import' | 'publication';

function itemKey(item: ContentStudioItem): string {
  return `${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`;
}

function statusLabel(item: ContentStudioItem): string {
  if (item.draftId) return '有草稿';
  if (item.status === 'published') return '已發布';
  if (item.status === 'archived') return '已封存';
  return '草稿';
}

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
  const [view, setView] = useState<StudioView>('list');
  const [selected, setSelected] = useState<ContentStudioItem | null>(null);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [bankKindFilter, setBankKindFilter] = useState<
    'all' | 'QB' | 'CR' | 'LT'
  >('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'published' | 'archived'
  >('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ContentEntityType>(
    'all',
  );
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const scopeQuery = useQuery({
    queryFn: () => repository.listScope({ chapterId: CHAPTER_3_ID }),
    queryKey: contentStudioKeys.scope(CHAPTER_3_ID),
  });
  const scope =
    scopeQuery.data && 'chapter' in scopeQuery.data ? scopeQuery.data : null;
  const items = useMemo(
    () => (scope ? flattenContentScope(scope) : []),
    [scope],
  );

  const confirmLeaveEditor = useCallback((): boolean => {
    if (!dirty) return true;
    return window.confirm('尚有未儲存變更，離開會捨棄這些變更。確定繼續嗎？');
  }, [dirty]);

  const openView = useCallback(
    (next: StudioView): void => {
      if (next !== view && !confirmLeaveEditor()) return;
      if (next !== view) setDirty(false);
      setView(next);
    },
    [confirmLeaveEditor, view],
  );

  const openEditor = useCallback(
    (item: ContentStudioItem): void => {
      if (!confirmLeaveEditor()) return;
      setSelected(item);
      setDirty(false);
      setNotice(null);
      setView('editor');
    },
    [confirmLeaveEditor],
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const editorQuery = useQuery({
    enabled:
      selected !== null &&
      (selected.entityId !== null || selected.draftId !== null),
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
  const editorNeedsLoading =
    selected !== null &&
    (selected.entityId !== null || selected.draftId !== null);
  const refreshContent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: contentStudioKeys.all });
  }, [queryClient]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('zh-Hant');
    return items.filter(
      (item) =>
        (statusFilter === 'all' ||
          item.status === statusFilter ||
          (statusFilter === 'draft' && item.draftId !== null)) &&
        (typeFilter === 'all' || item.entityType === typeFilter) &&
        (sectionFilter === 'all' || item.sectionId === sectionFilter) &&
        (bankKindFilter === 'all' || item.bankKind === bankKindFilter) &&
        (!normalized ||
          `${item.stableCode} ${item.title}`
            .toLocaleLowerCase('zh-Hant')
            .includes(normalized)),
    );
  }, [bankKindFilter, items, search, sectionFilter, statusFilter, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const resetPage = () => {
    setPage(1);
  };

  if (scopeQuery.isPending)
    return (
      <AdminPageLoading
        title="內容工作台"
        onRetry={() => scopeQuery.refetch()}
      />
    );

  if (!scope) {
    const message =
      scopeQuery.data?.outcome === 'denied'
        ? scopeQuery.data.message
        : '內容資料載入失敗，請稍後重試。';
    return (
      <section className="page-wide page-stack">
        <h1>內容工作台</h1>
        <p role="alert">{message}</p>
        <button
          className="secondary-action"
          type="button"
          onClick={() => void scopeQuery.refetch()}
        >
          重試
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="content-studio-heading"
      className="content-studio page-stack"
    >
      <header className="content-studio__heading">
        <div>
          <span>第三章內容切片</span>
          <h1 id="content-studio-heading">內容工作台</h1>
          <p>從清單新增或編輯；所有修改先儲存為草稿，不會直接影響學生。</p>
        </div>
        <nav aria-label="內容工作台功能" className="content-studio__nav">
          <button
            aria-pressed={view === 'list'}
            onClick={() => {
              openView('list');
            }}
            type="button"
          >
            <List aria-hidden="true" /> 清單
          </button>
          <button
            aria-pressed={view === 'import'}
            onClick={() => {
              openView('import');
            }}
            type="button"
          >
            <FileUp aria-hidden="true" /> 外部匯入
          </button>
          <button
            aria-pressed={view === 'publication'}
            onClick={() => {
              openView('publication');
            }}
            type="button"
          >
            <FileClock aria-hidden="true" /> 發布／歷史
          </button>
        </nav>
      </header>

      {notice ? (
        <p className="content-studio__notice" role="status">
          {notice}
        </p>
      ) : null}

      {view === 'import' || view === 'publication' ? (
        <ContentOperatorWorkflows
          editorState={editorState}
          importRepository={importRepository}
          mediaRepository={mediaRepository}
          onChanged={refreshContent}
          publicationRepository={publicationRepository}
          selected={selected}
          workflow={view}
        />
      ) : null}

      {view === 'editor' && selected ? (
        <section
          aria-label="內容編輯工作區"
          className="content-studio__editor-page"
        >
          {editorNeedsLoading && editorQuery.isPending ? (
            <p role="status">正在載入編輯資料…</p>
          ) : null}
          {(!editorNeedsLoading || !editorQuery.isPending) &&
          (editorState || (!selected.entityId && !selected.draftId)) ? (
            <ContentEditorForm
              allItems={items}
              item={selected}
              key={`${selected.entityType}-${selected.entityId ?? selected.draftId ?? 'new'}-${String(editorState?.draft?.revision ?? 0)}`}
              mediaRepository={mediaRepository}
              onCancel={() => {
                openView('list');
              }}
              onCreated={() => {
                setDirty(false);
                setNotice('內容已儲存，可在清單中確認。');
                setView('list');
                refreshContent();
              }}
              onDirtyChange={setDirty}
              onNewTypeChange={(entityType) => {
                setSelected(createNewContentItem(entityType, null));
              }}
              onReload={() => editorQuery.refetch()}
              repository={repository}
              scope={scope}
              state={editorState}
            />
          ) : null}
          {editorQuery.data?.outcome === 'denied' ? (
            <p role="alert">{editorQuery.data.message}</p>
          ) : null}
          {editorQuery.isError ? (
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
        </section>
      ) : null}

      {view === 'list' ? (
        <section aria-label="全部內容清單" className="content-studio__all">
          <div className="content-studio__filters">
            <button
              className="primary-action content-studio__add"
              onClick={() => {
                openEditor(createNewContentItem('review_card', null));
              }}
              type="button"
            >
              <Plus aria-hidden="true" /> 新增
            </button>
            <label>
              章節
              <select
                aria-label="章節"
                value={scope.chapter.chapterId}
                disabled
              >
                <option value={scope.chapter.chapterId}>
                  第 {scope.chapter.sortOrder} 章・{scope.chapter.title}
                </option>
              </select>
            </label>
            <label>
              小節
              <select
                aria-label="小節"
                value={sectionFilter}
                onChange={(event) => {
                  setSectionFilter(event.target.value);
                  resetPage();
                }}
              >
                <option value="all">全部小節</option>
                {scope.sections.map((section) => (
                  <option key={section.sectionId} value={section.sectionId}>
                    {section.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              內容類型
              <select
                aria-label="內容類型"
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as typeof typeFilter);
                  resetPage();
                }}
              >
                <option value="all">全部類型</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CONTENT_ENTITY_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              題庫類型
              <select
                aria-label="題庫類型"
                value={bankKindFilter}
                onChange={(event) => {
                  setBankKindFilter(
                    event.target.value as typeof bankKindFilter,
                  );
                  resetPage();
                }}
              >
                <option value="all">全部題庫</option>
                <option value="QB">QB 小節題庫</option>
                <option value="LT">LT Live 題庫</option>
                <option value="CR">CR 章節總題庫</option>
              </select>
            </label>
            <label>
              狀態
              <select
                aria-label="狀態"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as typeof statusFilter);
                  resetPage();
                }}
              >
                <option value="all">全部狀態</option>
                <option value="draft">有草稿</option>
                <option value="published">已發布</option>
                <option value="archived">已封存</option>
              </select>
            </label>
            <label className="content-studio__search">
              <Search aria-hidden="true" />
              <span>搜尋</span>
              <input
                aria-label="搜尋內容"
                placeholder="代碼或標題"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
              />
            </label>
          </div>
          <div className="content-studio__list-summary">
            <strong>{filtered.length} 筆內容</strong>
            <span>
              第 {currentPage}／{pageCount} 頁
            </span>
          </div>
          <div className="ui-table-scroll">
            <table aria-label="全部內容" className="ui-table">
              <thead>
                <tr>
                  <th scope="col">操作</th>
                  <th scope="col">代碼</th>
                  <th scope="col">類型</th>
                  <th scope="col">題庫</th>
                  <th scope="col">標題</th>
                  <th scope="col">狀態</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={itemKey(item)}>
                    <td>
                      <button
                        aria-label={`編輯 ${item.stableCode}`}
                        className="secondary-action content-studio__edit"
                        type="button"
                        onClick={() => {
                          openEditor(item);
                        }}
                      >
                        編輯
                      </button>
                    </td>
                    <td>{item.stableCode}</td>
                    <td>{CONTENT_ENTITY_LABELS[item.entityType]}</td>
                    <td>{item.bankKind ?? '—'}</td>
                    <td>{item.title}</td>
                    <td>
                      <span
                        className={`content-status content-status--${item.draftId ? 'draft' : item.status}`}
                      >
                        {statusLabel(item)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleItems.length === 0 ? (
            <p className="content-studio__empty">沒有符合篩選條件的內容。</p>
          ) : null}
          {pageCount > 1 ? (
            <nav
              aria-label="內容清單分頁"
              className="content-studio__pagination"
            >
              <button
                aria-label="上一頁"
                className="secondary-action"
                disabled={currentPage === 1}
                onClick={() => {
                  setPage((value) => Math.max(1, value - 1));
                }}
                type="button"
              >
                <ChevronLeft aria-hidden="true" /> 上一頁
              </button>
              <span aria-live="polite">
                第 {currentPage} 頁，共 {pageCount} 頁
              </span>
              <button
                aria-label="下一頁"
                className="secondary-action"
                disabled={currentPage === pageCount}
                onClick={() => {
                  setPage((value) => Math.min(pageCount, value + 1));
                }}
                type="button"
              >
                下一頁 <ChevronRight aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export { AdminContentPage as Component };
