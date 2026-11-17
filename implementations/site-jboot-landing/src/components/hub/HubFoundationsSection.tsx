import type { HubHomeContent } from "@/content/hub-home-content";

export function HubFoundationsSection({ content }: { content: HubHomeContent }) {
  return (
    <section id="fundamentos" className="ai-section ai-architecture">
      <div className="ai-circuit-grid" aria-hidden="true" />
      <div className="ai-container ai-architecture__content">
        <p className="ai-eyebrow">{content.foundations.eyebrow}</p>
        <h2>{content.foundations.title}</h2>
        <div className="ai-layer-grid">
          {content.foundations.layers.map(layer => (
            <article key={layer.id}><span>{layer.id}</span><h3>{layer.title}</h3><p>{layer.body}</p></article>
          ))}
        </div>
      </div>
    </section>
  );
}
