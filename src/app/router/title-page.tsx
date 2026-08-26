import { Link } from 'react-router-dom';

export function TitlePage() {
  return (
    <section className="home-world" data-interaction-group="foundation-route">
      <header className="home-world__brand-bar">
        <span className="home-world__crest">
          <img
            alt="ColorPlay 藍金寶典"
            height="60"
            src="/colorplay-grimoire-pixel.png"
            width="52"
          />
        </span>
        <span className="home-world__brand-name">ColorPlay</span>
      </header>

      <div className="home-world__story">
        <h1 className="home-world__title">ColorPlay</h1>
        <p className="home-world__subtitle">色彩王國的冒險旅程</p>
      </div>

      <div className="home-world__actions">
        <Link
          className="home-world__start"
          data-acceptance-interactive="true"
          data-acceptance-target
          data-primary-action="true"
          to="/login"
        >
          開始冒險
        </Link>
      </div>
    </section>
  );
}
