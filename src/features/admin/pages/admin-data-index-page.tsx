import { Link } from 'react-router-dom';

import { browserCatalogGroups } from '../api/admin-catalog';

/** Discoverable landing page for every safe-browser catalog domain/resource. */
export function AdminDataIndexPage() {
  const groups = browserCatalogGroups();

  return (
    <section
      aria-labelledby="admin-data-index-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-data-index-page-heading">資料瀏覽</h1>
      <p>選擇資料領域與資源。實際欄位與權限仍由伺服器 catalog 驗證。</p>
      <div className="admin-data-index__grid">
        {groups.map((group) => (
          <section
            aria-label={group.domain}
            className="admin-data-index__domain"
            key={group.domain}
          >
            <h2>{group.domain}</h2>
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
