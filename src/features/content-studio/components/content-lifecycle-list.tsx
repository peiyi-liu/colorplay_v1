import { useState } from 'react';
import {
  CONTENT_ENTITY_LABELS,
  type ContentStudioItem,
} from '../lib/content-studio-model';

export function ContentLifecycleList({
  items,
  mode,
  onSelect,
}: Readonly<{
  items: readonly ContentStudioItem[];
  mode: 'publication' | 'history';
  onSelect: (item: ContentStudioItem) => void;
}>) {
  const [search, setSearch] = useState('');
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const entries = items.filter(
    (item) =>
      (mode === 'publication'
        ? item.draftId && item.status !== 'archived'
        : item.entityId) &&
      (!archivedOnly || item.status === 'archived') &&
      `${item.stableCode} ${item.title}`
        .toLocaleLowerCase('zh-Hant')
        .includes(search.trim().toLocaleLowerCase('zh-Hant')),
  );
  const pageCount = Math.max(1, Math.ceil(entries.length / 12));
  const currentPage = Math.min(page, pageCount);
  return (
    <section
      className="content-studio__all"
      aria-label={mode === 'publication' ? '待發布草稿' : '內容與封存歷史'}
    >
      <h2>{mode === 'publication' ? '待發布草稿' : '內容與封存歷史'}</h2>
      <p>
        {mode === 'publication'
          ? '列出所有章節的待發布草稿。先核對差異與進度影響，再次確認後才會發布。新建父層須先發布。'
          : '直接查詢內容的版本事件；封存會下架內容，但不刪除歷史與學生作答紀錄。'}
      </p>
      <div className="content-studio__filters">
        <label>
          搜尋
          <input
            aria-label="搜尋發布或歷史內容"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        {mode === 'history' ? (
          <label>
            狀態
            <select
              aria-label="歷史狀態"
              value={archivedOnly ? 'archived' : 'all'}
              onChange={(event) => {
                setArchivedOnly(event.target.value === 'archived');
                setPage(1);
              }}
            >
              <option value="all">全部內容（含封存）</option>
              <option value="archived">僅封存內容</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className="ui-table-scroll">
        <table
          className="ui-table"
          aria-label={mode === 'publication' ? '發布清單' : '歷史清單'}
        >
          <thead>
            <tr>
              <th>操作</th>
              <th>代碼</th>
              <th>類型</th>
              <th>標題</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {entries
              .slice((currentPage - 1) * 12, currentPage * 12)
              .map((item) => (
                <tr
                  key={`${item.entityType}-${item.entityId ?? item.draftId ?? 'new'}`}
                >
                  <td>
                    <button
                      type="button"
                      className="secondary-action"
                      aria-label={`${mode === 'publication' ? '準備發布' : '查看歷史'} ${item.stableCode}`}
                      onClick={() => {
                        onSelect(item);
                      }}
                    >
                      {mode === 'publication' ? '準備發布' : '查看歷史'}
                    </button>
                  </td>
                  <td>{item.stableCode}</td>
                  <td>{CONTENT_ENTITY_LABELS[item.entityType]}</td>
                  <td>{item.title}</td>
                  <td>
                    {item.status === 'archived'
                      ? '已封存'
                      : item.draftId
                        ? '待發布草稿'
                        : '已發布'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {entries.length === 0 ? (
        <p role="status">
          {mode === 'publication'
            ? '目前沒有待發布草稿。'
            : '沒有符合條件的歷史內容。'}
        </p>
      ) : null}
      {pageCount > 1 ? (
        <nav className="content-studio__pagination" aria-label="發布歷史分頁">
          <button
            className="secondary-action"
            type="button"
            disabled={currentPage === 1}
            onClick={() => {
              setPage(currentPage - 1);
            }}
          >
            上一頁
          </button>
          <span>
            第 {currentPage}／{pageCount} 頁
          </span>
          <button
            className="secondary-action"
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
