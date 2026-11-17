import { landingContent } from "@/content/landing-content";
import { Reveal } from "@/components/Reveal";

export function FinalCta() {
  return (
    <section className="section section-clean" aria-labelledby="final-cta-title">
      <Reveal as="div" className="section-inner final-cta">
        <div>
          <p className="eyebrow eyebrow-dark">Acesso</p>
          <h2 id="final-cta-title">{landingContent.finalCta.title}</h2>
          <p>{landingContent.finalCta.description}</p>
        </div>
        <a className="button button-glow" href={landingContent.finalCta.href}>
          {landingContent.finalCta.label}
        </a>
      </Reveal>
    </section>
  );
}
