import { landingContent } from "@/content/landing-content";
import { Reveal } from "@/components/Reveal";

export function EcosystemSection() {
  return (
    <section className="section section-light" id="solucoes" aria-labelledby="ecosystem-title">
      <div className="section-inner">
        <Reveal as="div" className="section-heading">
          <p className="eyebrow eyebrow-dark">Solucoes</p>
          <h2 id="ecosystem-title">Modulos especializados em uma experiencia unificada.</h2>
          <p>
            O JBoot organiza diferentes frentes operacionais sem transformar a navegacao em um
            painel generico. Cada solucao preserva seu contexto e sua responsabilidade.
          </p>
        </Reveal>

        <div className="solution-grid">
          {landingContent.ecosystem.map((item, index) => (
            <Reveal as="article" className="solution-item" key={item.title} delayMs={index * 90}>
              <span className="solution-icon" aria-hidden="true">
                {item.icon}
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              {"cta" in item && item.cta ? (
                <a className="button button-compact solution-cta" href={item.cta.href}>
                  {item.cta.label}
                </a>
              ) : null}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
