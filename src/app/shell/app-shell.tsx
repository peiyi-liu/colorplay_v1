import { Link, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要內容
      </a>
      <header className="app-header">
        <div className="app-header__content">
          <Link className="brand" to="/" aria-label="ColorPlay 首頁">
            <span className="brand__mark" aria-hidden="true" />
            <span>ColorPlay</span>
          </Link>
          <span className="app-header__stage">色彩原理學習平台</span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
