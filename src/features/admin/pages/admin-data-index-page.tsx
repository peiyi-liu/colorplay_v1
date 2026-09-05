import { useState } from 'react';
import { Link } from 'react-router-dom';
import { browserCatalogGroups } from '../api/admin-catalog';
import {
  ADMIN_DATA_CATEGORIES,
  ADMIN_DATA_LABELS,
} from '../lib/admin-data-labels';

export function AdminDataIndexPage() {
  const [search, setSearch] = useState('');
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
      <header>
        <h1 id="admin-data-index-page-heading">資料查核</h1>
        <p>先選業務，再選資料。個人資料保持遮罩，這裡提供唯讀查詢。</p>
      </header>
      <label htmlFor="admin-resource-search">搜尋全部分類</label>
      <input
        id="admin-resource-search"
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        placeholder="例如：錯題、教材圖片、代幣、Live"
      />
      <div className="admin-data-categories" aria-label="資料分類">
        {ADMIN_DATA_CATEGORIES.map((c) => (
          <button
            className="secondary-action"
            type="button"
            aria-pressed={!query && category === c.id}
            key={c.id}
            onClick={() => {
              setCategory(c.id);
              setSearch('');
            }}
          >
            {c.title}
          </button>
        ))}
      </div>
      <p>
        {query
          ? '搜尋符合用途或技術名稱的資料入口。'
          : ADMIN_DATA_CATEGORIES.find((c) => c.id === category)?.description}
      </p>
      {visible.length === 0 ? (
        <p role="status">
          沒有符合的資料來源。
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              setSearch('');
            }}
          >
            清除搜尋
          </button>
        </p>
      ) : null}
      {groups.map((group) => (
        <section key={group} aria-label={group}>
          <h2>{group}</h2>
          <div className="admin-data-index__grid">
            {visible
              .filter((item) => (item.group ?? '其他受控資料') === group)
              .map((item) => (
                <article
                  className="admin-data-index__domain"
                  key={item.domain + '/' + item.resource}
                >
                  <Link to={'/admin/data/' + item.domain + '/' + item.resource}>
                    <strong>{item.title ?? item.resource}</strong>
                  </Link>
                  <p>{item.description ?? '依既有權限查閱此資料。'}</p>
                  <details>
                    <summary>技術名稱</summary>
                    <code>{item.resource}</code>
                  </details>
                </article>
              ))}
          </div>
        </section>
      ))}
    </section>
  );
}
export { AdminDataIndexPage as Component };
