import { v5Content } from "@/content/v5-content";

export function FinalCta() {
  return (
    <section className="v5-final-cta" aria-labelledby="v5-final-title">
      <div className="v5-container">
        <div className="v5-final-inner">
          <h2 id="v5-final-title">{v5Content.finalCta.headline}</h2>
          <p>{v5Content.finalCta.description}</p>
          <a className="v5-button v5-button-primary" href={v5Content.finalCta.cta.href}>
            <i className="ri-login-circle-line" aria-hidden="true" />
            <span>{v5Content.finalCta.cta.label}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
