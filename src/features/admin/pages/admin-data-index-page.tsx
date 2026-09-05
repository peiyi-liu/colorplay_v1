import { useState } from 'react';
import { Link } from 'react-router-dom';

import { browserCatalogGroups } from '../api/admin-catalog';

/** Discoverable landing page for every safe-browser catalog domain/resource. */
export function AdminDataIndexPage() {
  const [search, setSearch] = useState('');
  const names: Record<string, string> = {
    users: '使用者',
    learning: '學習內容',
    game: '遊戲與獎勵',
    classroom: '班級',
    classrooms: '班級',
    assessment: '評量',
    live: '即時活動',
    content: '教學內容',
    economy: '獎勵與收藏',
    progress: '學習進度',
    security: '安全',
    research: '研究',
  };
  const groups = browserCatalogGroups()
    .map((group) => ({
      ...group,
      resources: group.resources.filter((resource) =>
        `${names[group.domain] ?? ''} ${group.domain} ${resource}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.resources.length > 0);

  return (
    <section
      aria-labelledby="admin-data-index-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-data-index-page-heading">資料瀏覽</h1>
      <p>選擇要查核的資料。個人資料保持遮罩，這裡提供唯讀查詢。</p>
      <label htmlFor="admin-resource-search">尋找資料來源</label>
      <input
        id="admin-resource-search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        placeholder="輸入領域或資源名稱"
      />
      {groups.length === 0 ? (
        <p>
          沒有符合的資料來源。
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setSearch('');
            }}
          >
            清除搜尋
          </button>
        </p>
      ) : null}
      <div className="admin-data-index__grid">
        {groups.map((group) => (
          <section
            aria-label={group.domain}
            className="admin-data-index__domain"
            key={group.domain}
          >
            <h2>
              {names[group.domain] ?? group.domain}{' '}
              <small>({group.domain})</small>
            </h2>
            <ul className="admin-data-index__resources">
              {group.resources.map((resource) => (
                <li key={resource}>
                  <Link to={`/admin/data/${group.domain}/${resource}`}>
                    {resource}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

export { AdminDataIndexPage as Component };
