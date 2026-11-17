import { aiFirstHomeContent as content } from "@/content/ai-first-home-content";

export function SolutionsSection() {
  return (
    <section id="solucoes" className="ai-section ai-section--bordered">
      <div className="ai-container">
        <div className="ai-section-heading ai-section-heading--split">
          <h2>Soluções reais. Fronteiras explícitas.</h2>
          <p>Produtos e plano de controle colaboram sem perder contratos, permissões e ciclos de evolução próprios.</p>
        </div>
        <div className="ai-solution-grid">
          {content.solutions.map(solution => (
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
