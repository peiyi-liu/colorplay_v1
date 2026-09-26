import { useQuery, useQueryClient } from '@tanstack/react-query';
import { List, PanelLeft, Plus, Search } from 'lucide-react';
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
const ENTITY_TYPES = Object.keys(CONTENT_ENTITY_LABELS) as ContentEntityType[];

function ItemButton({
  item,
  onSelect,
  selected,
}: Readonly<{
  item: ContentStudioItem;
  onSelect: (item: ContentStudioItem) => void;
  selected: boolean;
}>) {
  return (
    <button
      aria-label={`${item.stableCode} ${item.title}`}
      aria-current={selected ? 'true' : undefined}
      className="content-item-button"
      onClick={() => {
        onSelect(item);
      }}
      type="button"
    >
      <span>{item.stableCode}</span>
      <strong>{item.title}</strong>
      {item.draftId ? <small>有草稿</small> : null}
    </button>
  );
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
  const [mode, setMode] = useState<'workspace' | 'list'>('workspace');
  const [selected, setSelected] = useState<ContentStudioItem | null>(null);
  const [entityType, setEntityType] =
    useState<ContentEntityType>('review_card');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'published' | 'archived'
  >('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ContentEntityType>(
    'all',
  );
  const [dirty, setDirty] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

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

  const choose = useCallback(
    (next: ContentStudioItem): boolean => {
      if (dirty && !window.confirm('尚有未儲存變更，確定要切換內容嗎？'))
        return false;
      setSelected(next);
      setDirty(false);
      return true;
    },
    [dirty],
  );

  const switchMode = (next: 'workspace' | 'list') => {
    if (
      next !== mode &&
      dirty &&
      !window.confirm('尚有未儲存變更，切換模式會捨棄這些變更。確定繼續嗎？')
    )
      return;
    if (next !== mode) setDirty(false);
    setMode(next);
  };

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
        (!normalized ||
          `${item.stableCode} ${item.title}`
            .toLocaleLowerCase('zh-Hant')
            .includes(normalized)),
    );
  }, [items, search, statusFilter, typeFilter]);

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
          <p>
            所有修改先成為持久草稿；發布、封存與回復會在操作流程中另外確認。
          </p>
        </div>
        <div aria-label="內容工作台顯示模式" className="content-studio__mode">
          <button
            aria-pressed={mode === 'workspace'}
            onClick={() => {
              switchMode('workspace');
            }}
            type="button"
          >
            <PanelLeft aria-hidden="true" /> 工作區
          </button>
          <button
            aria-pressed={mode === 'list'}
            onClick={() => {
              switchMode('list');
            }}
            type="button"
          >
            <List aria-hidden="true" /> 全部內容清單
          </button>
        </div>
      </header>

      <div className="content-studio__create">
        <label>
          新增類型
          <select
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value as ContentEntityType);
            }}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTENT_ENTITY_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-action"
          onClick={() => {
            if (choose(createNewContentItem(entityType, selected))) {
              setMode('workspace');
            }
          }}
          type="button"
        >
          <Plus aria-hidden="true" /> 新增草稿
        </button>
        {selected ? (
          <span>已選取：{selected.stableCode || selected.title}</span>
        ) : null}
      </div>

      <ContentOperatorWorkflows
        authoringRepository={repository}
        editorState={editorState}
        importRepository={importRepository}
        mediaRepository={mediaRepository}
        onChanged={refreshContent}
        publicationRepository={publicationRepository}
        selected={selected}
      />

      {mode === 'workspace' ? (
        <div className="content-studio__workspace">
          <section aria-label="內容階層" className="content-studio__tree">
            <header>
              <h2>內容階層</h2>
              <span>{scope.chapter.title}</span>
            </header>
            {items[0] ? (
              <ItemButton
                item={items[0]}
                onSelect={choose}
                selected={selected?.entityId === items[0].entityId}
              />
            ) : null}
            {scope.sections.map((section) => {
              const sectionItem = items.find(
                (item) => item.entityId === section.sectionId,
              );
              return (
                <details key={section.sectionId} open>
                  <summary>{section.title}</summary>
                  {sectionItem ? (
                    <ItemButton
                      item={sectionItem}
                      onSelect={choose}
                      selected={selected?.entityId === sectionItem.entityId}
                    />
                  ) : null}
                  {section.subtopics.map((subtopic) => {
                    const subtopicItem = items.find(
                      (item) => item.entityId === subtopic.subtopicId,
                    );
                    return subtopicItem ? (
                      <ItemButton
                        key={subtopic.subtopicId}
                        item={subtopicItem}
                        onSelect={choose}
                        selected={selected?.entityId === subtopicItem.entityId}
                      />
                    ) : null;
                  })}
                </details>
              );
            })}
          </section>
          <section aria-label="範圍內容" className="content-studio__list">
            <header>
              <h2>範圍內容</h2>
              <span>{items.length} 項</span>
            </header>
            {items
              .filter(
                (item) =>
                  !['chapter', 'section', 'subtopic'].includes(item.entityType),
              )
              .map((item) => (
                <ItemButton
                  item={item}
                  key={`${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`}
                  onSelect={choose}
                  selected={
                    (selected?.entityId ?? selected?.draftId) ===
                    (item.entityId ?? item.draftId)
                  }
                />
              ))}
          </section>
          <section aria-label="內容編輯器" className="content-studio__editor">
            {!selected ? (
              <div className="content-studio__empty">
                <h2>選取內容開始編輯</h2>
                <p>也可以先選擇類型建立新草稿。</p>
              </div>
            ) : null}
            {selected && editorQuery.isPending ? (
              <p role="status">正在載入編輯資料…</p>
            ) : null}
            {selected &&
            !editorQuery.isPending &&
            (editorState || (!selected.entityId && !selected.draftId)) ? (
              <ContentEditorForm
                item={selected}
                key={`${selected.entityType}-${selected.entityId ?? selected.draftId ?? 'new'}-${String(editorState?.draft?.revision ?? 0)}`}
                onDirtyChange={setDirty}
                onReload={() => editorQuery.refetch()}
                repository={repository}
                state={editorState}
              />
            ) : null}
            {selected && editorQuery.data?.outcome === 'denied' ? (
              <p role="alert">{editorQuery.data.message}</p>
            ) : null}
            {selected && editorQuery.isError ? (
              <>
                <p role="alert">編輯資料載入失敗。</p>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => void editorQuery.refetch()}
                >
                  重新載入
                </button>
              </>
            ) : null}
          </section>
        </div>
      ) : (
        <section aria-label="全部內容清單" className="content-studio__all">
          <div className="content-studio__filters">
            <label className="content-studio__search">
              <Search aria-hidden="true" />
              <span className="sr-only">搜尋</span>
              <input
                aria-label="搜尋內容"
                placeholder="搜尋代碼或標題"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </label>
            <label>
              類型
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as typeof typeFilter);
                }}
              >
                <option value="all">全部</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CONTENT_ENTITY_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              狀態
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as typeof statusFilter);
                }}
              >
                <option value="all">全部</option>
                <option value="draft">有草稿</option>
                <option value="published">已發布</option>
                <option value="archived">已封存</option>
              </select>
            </label>
          </div>
          <div className="ui-table-scroll">
            <table aria-label="全部內容" className="ui-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">批次選取</span>
                  </th>
                  <th scope="col">代碼</th>
                  <th scope="col">類型</th>
                  <th scope="col">標題</th>
                  <th scope="col">狀態</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={`${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`}
                  >
                    <td>
                      <input
                        aria-label={`選取 ${item.stableCode}`}
                        checked={bulkSelected.has(
                          `${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`,
                        )}
                        onChange={(event) => {
                          const key = `${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`;
                          setBulkSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                        }}
                        type="checkbox"
                      />
                    </td>
                    <td>{item.stableCode}</td>
                    <td>{CONTENT_ENTITY_LABELS[item.entityType]}</td>
                    <td>{item.title}</td>
                    <td>
                      {item.draftId
                        ? '有草稿'
                        : item.status === 'published'
                          ? '已發布'
                          : item.status === 'archived'
                            ? '已封存'
                            : '草稿'}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          if (choose(item)) setMode('workspace');
                        }}
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bulkSelected.size > 0 ? (
            <p role="status">
              已選取 {bulkSelected.size}{' '}
              項；本階段為避免部分成功，請逐項開啟並確認發布／封存影響。
            </p>
          ) : null}
          {filtered.length === 0 ? <p>沒有符合篩選條件的內容。</p> : null}
        </section>
      )}
    </section>
  );
}

export { AdminContentPage as Component };
