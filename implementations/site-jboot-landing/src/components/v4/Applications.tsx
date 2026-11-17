import { v4Content } from "@/content/v4-content";

export function Applications() {
  return (
    <section className="v4-section" id={v4Content.applications.id} aria-labelledby="v4-apps-title">
      <div className="v4-container">
        <div className="v4-section-heading">
          <p className="v4-eyebrow">{v4Content.applications.eyebrow}</p>
          <h2 id="v4-apps-title">{v4Content.applications.headline}</h2>
        </div>
        <div className="v4-module-grid">
          {v4Content.applications.modules.map(module => (
            <article className="v4-module" key={module.name}>
              <i className={module.icon} aria-hidden="true" />
              <div>
                <h3>{module.name}</h3>
                <p>{module.note}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
