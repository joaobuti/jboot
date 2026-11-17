import { aiFirstHomeContent as content } from "@/content/ai-first-home-content";

export function ArchitectureSection() {
  return (
    <section id="arquitetura" className="ai-section ai-architecture">
      <div className="ai-circuit-grid" aria-hidden="true" />
      <div className="ai-container ai-architecture__content">
        <p className="ai-eyebrow">{content.architecture.eyebrow}</p>
        <h2>{content.architecture.title}</h2>
        <div className="ai-layer-grid">
          {content.architecture.layers.map(layer => (
            <article key={layer.id}><span>{layer.id}</span><h3>{layer.title}</h3><p>{layer.body}</p></article>
          ))}
        </div>
      </div>
    </section>
  );
}
