import { v4Content } from "@/content/v4-content";

export function HubModel() {
  return (
    <section className="v4-section v4-hub-model" id={v4Content.hub.id} aria-labelledby="v4-hub-title">
      <div className="v4-container v4-model-grid">
        <div>
          <p className="v4-eyebrow">{v4Content.hub.eyebrow}</p>
          <h2 id="v4-hub-title">{v4Content.hub.headline}</h2>
          <p>{v4Content.hub.description}</p>
        </div>
        <div className="v4-lane-list" aria-label="Fluxo operacional do JBoot">
          {v4Content.hub.lanes.map((lane, index) => (
            <div className="v4-lane" key={lane}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{lane}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
