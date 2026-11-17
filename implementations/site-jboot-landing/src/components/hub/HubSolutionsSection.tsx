import type { HubHomeContent } from "@/content/hub-home-content";

export function HubSolutionsSection({ content }: { content: HubHomeContent }) {
  return (
    <section id="produtos" className="ai-section ai-section--bordered">
      <div className="ai-container">
        <div className="ai-section-heading ai-section-heading--split">
          <h2>{content.solutions.title}</h2>
          <p>{content.solutions.description}</p>
        </div>
        <div className="ai-solution-grid">
          {content.solutions.items.map(solution => (
            <article key={solution.id}>
              <div className="ai-card-meta"><span>{solution.id}</span><span>{solution.segment}</span></div>
              <h3>{solution.name}</h3>
              <strong>{solution.claim}</strong>
              <p>{solution.detail}</p>
              <small>{solution.signal}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
