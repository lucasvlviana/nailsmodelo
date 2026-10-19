import { SHOP, THEME } from "../shared/catalog.js";
import { THEMES } from "../shared/themes.js";

// Modo demonstração (shop.config.js → demoThemes: true): mostra a mesma studio em cada tema.
// Vidrinho de esmalte (usado quando o studio não tem logo própria); as cores vêm do tema
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 40 58" aria-hidden="true">
      <rect x="13" y="1" width="14" height="19" rx="4" fill="var(--deco-c)" />
      <rect x="15.5" y="1" width="3" height="19" rx="1.5" fill="#fff" opacity=".35" />
      <path d="M11 22h18l4 7v22a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V29z" fill="var(--deco-a)" />
      <path d="M11 22h18l4 7v22a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V29z" fill="none" stroke="var(--brand-text)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 33v16" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}

function DemoBar() {
  const current = new URLSearchParams(location.search).get("tema") || null;
  return (
    <div className="demo-bar" role="navigation" aria-label="Escolher tema da demonstração">
      <span>Demonstração · tema:</span>
      {Object.entries(THEMES).map(([key, t]) => (
        <a key={key} href={`?tema=${key}`} className={(current || "") === key ? "is-active" : ""}>
          {t.label}
        </a>
      ))}
    </div>
  );
}

export default function SiteHeader() {
  return (
    <>
      {SHOP.demoThemes && <DemoBar />}
      <header className="site-header">
        <div className="site-header__inner">
          {SHOP.logo ? (
            <img className="site-header__logo" src={SHOP.logo} alt="" />
          ) : (
            <LogoMark />
          )}
          <div>
            <h1 className="site-header__name">{SHOP.name}</h1>
            {SHOP.tagline && <p className="site-header__tag">{SHOP.tagline}</p>}
          </div>
        </div>
      </header>
    </>
  );
}
