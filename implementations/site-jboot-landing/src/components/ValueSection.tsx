import { landingContent } from "@/content/landing-content";
import { Reveal } from "@/components/Reveal";

export function ValueSection() {
  return (
    <section className="section section-dark" aria-labelledby="value-title">
      <div className="section-inner value-layout">
        <Reveal as="div" className="section-heading">
          <p className="eyebrow">Base operacional</p>
          <h2 id="value-title">Tecnologia a favor da operacao, sem expor complexidade.</h2>
          <p>
            A marca JBoot nasce para sustentar produtos modulares com controle de acesso,
            organizacao de contexto e evolucao tecnica rastreavel.
          </p>
        </Reveal>

        <div className="value-list">
          {landingContent.values.map((item, index) => (
            <Reveal as="article" className="value-item" key={item.title} delayMs={index * 90}>
              <span aria-hidden="true" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
