import { Search, LockKeyhole, FileText, ArrowRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { browserCatalogGroups } from '../api/admin-catalog';
import {
  ADMIN_DATA_CATEGORIES,
  ADMIN_DATA_LABELS,
} from '../lib/admin-data-labels';

export function AdminDataIndexPage() {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>('content');
  const query = search.trim().toLowerCase();
  const resources = browserCatalogGroups().flatMap(({ domain, resources }) =>
    resources.map((resource) => ({
      domain,
      resource,
      ...ADMIN_DATA_LABELS[resource],
    })),
  );
  const visible = resources.filter((item) =>
    query
      ? [item.title, item.description, item.group, item.resource, item.domain]
          .join(' ')
          .toLowerCase()
          .includes(query)
      : item.category === category || !item.category,
  );
  const groups = [
    ...new Set(visible.map((item) => item.group ?? '其他受控資料')),
  ];
  return (
    <section
      aria-labelledby="admin-data-index-page-heading"
      className="page-wide page-stack"
    >
      <header className="admin-page-heading">
        <h1 id="admin-data-index-page-heading">資料查核</h1>
        <p>從業務問題，找到需要的資料。</p>
      </header>
      <div className="admin-resource-toolbar">
        <label
          className="admin-resource-search"
          htmlFor="admin-resource-search"
        >
          <Search aria-hidden="true" />
          <span className="sr-only">搜尋全部分類</span>
          <input
            ref={searchRef}
            id="admin-resource-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="例如：錯題、教材圖片、代幣、Live"
          />
        </label>
        <span>
          <LockKeyhole aria-hidden="true" />
          個人資料保持遮罩 · 唯讀查詢
        </span>
      </div>
      <div className="admin-catalog-panel">
        <div className="admin-data-categories" aria-label="資料分類">
          <p>依業務分類 · {resources.length} 個入口</p>
          {ADMIN_DATA_CATEGORIES.map((c) => (
            <button
              aria-label={c.title}
              type="button"
              aria-pressed={!query && category === c.id}
              key={c.id}
              onClick={() => {
                setCategory(c.id);
                setSearch('');
              }}
            >
              {c.title}
              <span aria-hidden="true">
                {resources.filter((r) => r.category === c.id).length}
              </span>
            </button>
          ))}
        </div>
        <div className="admin-catalog-results">
          <header>
            <h2>
              {query
                ? '全部分類搜尋結果'
                : ADMIN_DATA_CATEGORIES.find((c) => c.id === category)?.title}
            </h2>
            <span role="status">{visible.length} 個入口</span>
          </header>
          <p>
            {query
              ? '搜尋符合用途或技術名稱的資料入口。'
              : ADMIN_DATA_CATEGORIES.find((c) => c.id === category)
                  ?.description}
          </p>
          {visible.length === 0 ? (
            <p role="status">
              沒有符合的資料來源。
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setSearch('');
                  searchRef.current?.focus();
                }}
              >
                清除搜尋
              </button>
            </p>
          ) : null}
          {groups.map((group) => (
            <section
              className="admin-catalog-group"
              key={group}
              aria-label={group}
            >
              <h3>{group}</h3>
              <div className="admin-data-index__grid">
                {visible
                  .filter((item) => (item.group ?? '其他受控資料') === group)
                  .map((item) => (
                    <article
                      className="admin-data-index__domain"
                      key={item.domain + '/' + item.resource}
                    >
                      <Link
                        aria-label={item.title ?? item.resource}
                        aria-describedby={
                          'admin-resource-description-' + item.resource
                        }
                        to={'/admin/data/' + item.domain + '/' + item.resource}
                      >
                        <FileText aria-hidden="true" />
                        <span>
                          <strong>{item.title ?? item.resource}</strong>
                          <small
                            id={'admin-resource-description-' + item.resource}
                          >
                            {item.description ?? '依既有權限查閱此資料。'}
                          </small>
                        </span>
                        <ArrowRight aria-hidden="true" />
                      </Link>
                      <details>
                        <summary>技術名稱</summary>
                        <code>{item.resource}</code>
                      </details>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className="admin-catalog-shortcuts">
        <span>快速找到</span>
        {['複習卡', '教材圖片', 'Live', '代幣'].map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => {
              setSearch(term);
              searchRef.current?.focus();
            }}
          >
            {term}
          </button>
        ))}
      </div>
    </section>
  );
}
export { AdminDataIndexPage as Component };
