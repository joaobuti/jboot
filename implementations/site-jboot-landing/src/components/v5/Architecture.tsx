import { v5Content } from "@/content/v5-content";

export function Architecture() {
  return (
    <section className="v5-section v5-architecture" id={v5Content.architecture.id} aria-labelledby="v5-architecture-title">
      <div className="v5-container v5-architecture-grid">
        <div>
          <p className="v5-eyebrow">{v5Content.architecture.eyebrow}</p>
          <h2 id="v5-architecture-title">{v5Content.architecture.headline}</h2>
          <p>{v5Content.architecture.description}</p>
        </div>
        <div className="v5-lane-stack" aria-label="Camadas da arquitetura JBoot">
          {v5Content.architecture.lanes.map((lane, index) => (
            <div className="v5-lane" key={lane}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{lane}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
