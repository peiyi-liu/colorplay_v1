import { Link } from 'react-router-dom';

// 遊戲標題畫面（spec §8，owner 0801 17:05）：icon＋PRESS START，
// 按下進既有登入頁（身分切換沿用登入頁，本批零接觸）。
export function TitlePage() {
  return (
    <section className="title-screen" data-interaction-group="foundation-route">
      <span aria-hidden="true" className="title-screen__mark">
        <svg fill="none" height="96" viewBox="0 0 32 32" width="96">
          <circle cx="11" cy="12" fill="var(--coral-700)" r="7" />
          <circle
            cx="21"
            cy="12"
            fill="var(--cobalt-600)"
            fillOpacity="0.92"
            r="7"
          />
          <circle
            cx="16"
            cy="20"
            fill="var(--jade-600)"
            fillOpacity="0.92"
            r="7"
          />
        </svg>
      </span>
      <h1 className="title-screen__logo">ColorPlay</h1>
      <p className="title-screen__subtitle">色彩原理遊戲式學習平台</p>
      <Link
        className="title-screen__start"
        data-acceptance-interactive="true"
        data-acceptance-target
        data-primary-action="true"
        to="/login"
      >
        PRESS START
      </Link>
    </section>
  );
}
