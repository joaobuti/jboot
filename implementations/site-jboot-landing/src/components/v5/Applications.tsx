import { v5Content } from "@/content/v5-content";

export function Applications() {
  return (
    <section className="v5-section" id={v5Content.applications.id} aria-labelledby="v5-apps-title">
      <div className="v5-container">
        <div className="v5-section-heading v5-heading-split">
          <div>
            <p className="v5-eyebrow">{v5Content.applications.eyebrow}</p>
            <h2 id="v5-apps-title">{v5Content.applications.headline}</h2>
          </div>
        </div>
        <div className="v5-card-grid">
          {v5Content.applications.items.map(item => (
            <article className="v5-feature-card" key={item.title}>
              <i className={item.icon} aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
