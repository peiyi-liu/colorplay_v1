import { useState } from 'react';
import type {
  ContentCatalog,
  ContentEntityType,
  ContentScope,
} from '../api/contracts';
import {
  CONTENT_ENTITY_LABELS,
  type ContentStudioItem,
} from '../lib/content-studio-model';

export function ContentList({
  catalog,
  chapterId,
  items,
  onChapterChange,
  onEdit,
  onNew,
  scope,
}: Readonly<{
  catalog: ContentCatalog;
  chapterId: string;
  items: readonly ContentStudioItem[];
  onChapterChange: (id: string) => void;
  onEdit: (item: ContentStudioItem) => void;
  onNew: () => void;
  scope: ContentScope;
}>) {
  const [section, setSection] = useState('all');
  const [type, setType] = useState('all');
  const [bank, setBank] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filtered = items.filter(
    (item) =>
      item.status !== 'archived' &&
      (item.chapterId === chapterId || item.chapterId === null) &&
      (section === 'all' || item.sectionId === section) &&
      (type === 'all' || item.entityType === type) &&
      (bank === 'all' || item.bankKind === bank) &&
      (status === 'all' ||
        (status === 'draft'
          ? item.draftId !== null
          : item.status === status && !item.draftId)) &&
      `${item.stableCode} ${item.title}`
        .toLocaleLowerCase('zh-Hant')
        .includes(search.trim().toLocaleLowerCase('zh-Hant')),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <section aria-label="全部內容清單" className="content-studio__all">
      <div className="content-studio__filters">
        <button
          className="primary-action content-studio__add"
          type="button"
          onClick={onNew}
        >
          新增
        </button>
        <label>
          章節
          <select
            aria-label="章節"
            value={chapterId}
            onChange={(event) => {
              onChapterChange(event.target.value);
              setSection('all');
              setPage(1);
            }}
          >
            {catalog.chapters
              .filter((chapter) => chapter.status !== 'archived')
              .map((chapter) => (
                <option key={chapter.chapterId} value={chapter.chapterId}>
                  第 {chapter.sortOrder} 章・{chapter.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          小節
          <select
            aria-label="小節"
            value={section}
            onChange={(event) => {
              change(setSection, event.target.value);
            }}
          >
            <option value="all">全部小節</option>
            {scope.sections
              .filter((entry) => entry.status !== 'archived')
              .map((entry) => (
                <option key={entry.sectionId} value={entry.sectionId}>
                  {entry.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          內容類型
          <select
            aria-label="內容類型"
            value={type}
            onChange={(event) => {
              change(setType, event.target.value);
            }}
          >
            <option value="all">全部類型</option>
            {(Object.keys(CONTENT_ENTITY_LABELS) as ContentEntityType[]).map(
              (entry) => (
                <option key={entry} value={entry}>
                  {CONTENT_ENTITY_LABELS[entry]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          題庫類型
          <select
            aria-label="題庫類型"
            value={bank}
            onChange={(event) => {
              change(setBank, event.target.value);
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
            value={status}
            onChange={(event) => {
              change(setStatus, event.target.value);
            }}
          >
            <option value="all">全部狀態</option>
            <option value="draft">有草稿</option>
            <option value="published">已發布</option>
          </select>
        </label>
        <label className="content-studio__search">
          搜尋
          <input
            aria-label="搜尋內容"
            placeholder="代碼或標題"
            value={search}
            onChange={(event) => {
              change(setSearch, event.target.value);
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
      <p className="content-workflow__hint">
        封存內容不顯示於此；請到「歷史」查詢。草稿標題尚未發布給學生。
      </p>
      <div className="ui-table-scroll">
        <table aria-label="全部內容" className="ui-table">
          <thead>
            <tr>
              {['操作', '代碼', '類型', '題庫', '標題', '狀態'].map(
                (heading) => (
                  <th key={heading} scope="col">
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr
                key={`${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`}
              >
                <td>
                  <button
                    aria-label={`編輯 ${item.stableCode}`}
                    className="secondary-action content-studio__edit"
                    type="button"
                    onClick={() => {
                      onEdit(item);
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
                    {item.draftId
                      ? '有草稿'
                      : item.status === 'published'
                        ? '已發布'
                        : '草稿'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <p className="content-studio__empty">沒有符合篩選條件的內容。</p>
      ) : null}
      {pageCount > 1 ? (
        <nav aria-label="內容清單分頁" className="content-studio__pagination">
          <button
            className="secondary-action"
            aria-label="上一頁"
            type="button"
            disabled={currentPage === 1}
            onClick={() => {
              setPage(currentPage - 1);
            }}
          >
            上一頁
          </button>
          <span aria-live="polite">
            第 {currentPage} 頁，共 {pageCount} 頁
          </span>
          <button
            className="secondary-action"
            aria-label="下一頁"
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => {
              setPage(currentPage + 1);
            }}
          >
            下一頁
          </button>
        </nav>
      ) : null}
    </section>
  );
}
