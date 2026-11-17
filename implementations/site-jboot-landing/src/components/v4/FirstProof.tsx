import { v4Content } from "@/content/v4-content";

export function FirstProof() {
  return (
    <section className="v4-section v4-proof-section" id={v4Content.firstProof.id} aria-labelledby="v4-proof-title">
      <div className="v4-container">
        <div className="v4-section-heading">
          <p className="v4-eyebrow">{v4Content.firstProof.eyebrow}</p>
          <h2 id="v4-proof-title">{v4Content.firstProof.headline}</h2>
        </div>
        <div className="v4-proof-grid">
          {v4Content.firstProof.items.map(item => (
            <article className="v4-proof-card" key={item.title}>
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
