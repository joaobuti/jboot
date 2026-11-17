import { v4Content } from "@/content/v4-content";

export function FinalCta() {
  return (
    <section className="v4-final" aria-labelledby="v4-final-title">
      <div className="v4-container v4-final-grid">
        <div>
          <h2 id="v4-final-title">{v4Content.finalCta.headline}</h2>
          <p>{v4Content.finalCta.description}</p>
        </div>
        <a className="v4-button v4-button-primary" href={v4Content.finalCta.cta.href}>
          <i className="ri-login-circle-line" aria-hidden="true" />
          <span>{v4Content.finalCta.cta.label}</span>
        </a>
      </div>
    </section>
  );
}
