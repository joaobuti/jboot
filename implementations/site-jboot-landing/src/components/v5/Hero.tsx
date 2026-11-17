import { v5Content } from "@/content/v5-content";

export function Hero() {
  return (
    <section className="v5-hero" aria-labelledby="v5-hero-title">
      <div className="v5-hero-media" aria-hidden="true" />
      <div className="v5-hero-overlay" />
      <div className="v5-container v5-hero-grid">
        <div className="v5-hero-copy">
          <p className="v5-eyebrow">{v5Content.hero.eyebrow}</p>
          <h1 id="v5-hero-title">{v5Content.hero.headline}</h1>
          <p className="v5-lead">{v5Content.hero.subheadline}</p>
          <div className="v5-actions">
            <a className="v5-button v5-button-primary" href={v5Content.hero.primaryCta.href}>
              <i className="ri-login-circle-line" aria-hidden="true" />
              <span>{v5Content.hero.primaryCta.label}</span>
            </a>
            <a className="v5-button v5-button-secondary" href={v5Content.hero.secondaryCta.href}>
              <i className="ri-route-line" aria-hidden="true" />
              <span>{v5Content.hero.secondaryCta.label}</span>
            </a>
          </div>
        </div>
        <aside className="v5-command-panel" aria-label="Sinais do ecossistema JBoot">
          <div className="v5-panel-topline">
            <span>JBoot Hub</span>
            <span>online</span>
          </div>
          <div className="v5-topology-map" aria-hidden="true">
            <span className="v5-core">Identity</span>
            <span className="v5-node v5-node-a">PDV</span>
            <span className="v5-node v5-node-b">Juridico</span>
            <span className="v5-node v5-node-c">Apps</span>
          </div>
          <ul className="v5-signal-list">
            {v5Content.hero.signals.map(signal => (
              <li key={signal}>
                <i className="ri-checkbox-circle-line" aria-hidden="true" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
