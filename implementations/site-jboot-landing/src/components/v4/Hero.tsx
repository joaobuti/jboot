import { v4Content } from "@/content/v4-content";

export function Hero() {
  return (
    <section className="v4-hero" aria-labelledby="v4-hero-title">
      <div className="v4-hero-bg" aria-hidden="true" />
      <div className="v4-container v4-hero-grid">
        <div className="v4-hero-copy">
          <p className="v4-eyebrow">{v4Content.hero.eyebrow}</p>
          <h1 id="v4-hero-title">{v4Content.hero.headline}</h1>
          <p className="v4-lead">{v4Content.hero.subheadline}</p>
          <div className="v4-actions">
            <a className="v4-button v4-button-primary" href={v4Content.hero.primaryCta.href}>
              <i className="ri-login-circle-line" aria-hidden="true" />
              <span>{v4Content.hero.primaryCta.label}</span>
            </a>
            <a className="v4-button v4-button-ghost" href={v4Content.hero.secondaryCta.href}>
              <i className="ri-arrow-down-line" aria-hidden="true" />
              <span>{v4Content.hero.secondaryCta.label}</span>
            </a>
          </div>
        </div>
        <aside className="v4-hero-console" aria-label="Resumo visual do hub JBoot">
          <div className="v4-console-head">
            <span>Application Hub</span>
            <strong>active</strong>
          </div>
          <div className="v4-selector">
            <div className="v4-selector-row v4-selector-row-active">
              <i className="ri-shield-keyhole-line" aria-hidden="true" />
              <span>Identity</span>
              <strong>controle</strong>
            </div>
            <div className="v4-selector-row">
              <i className="ri-store-2-line" aria-hidden="true" />
              <span>PDV</span>
              <strong>operacao</strong>
            </div>
            <div className="v4-selector-row">
              <i className="ri-scales-3-line" aria-hidden="true" />
              <span>Juridico</span>
              <strong>modulo</strong>
            </div>
          </div>
          <ul className="v4-proof-list">
            {v4Content.hero.proof.map(item => (
              <li key={item}>
                <i className="ri-check-line" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="v4-scroll-hint" aria-hidden="true">
        <span>continue</span>
        <i className="ri-arrow-down-line" />
      </div>
    </section>
  );
}
