import { landingContent } from "@/content/landing-content";
import { Reveal } from "@/components/Reveal";

export function TrustSection() {
  return (
    <section className="section section-clean" id="confianca" aria-labelledby="trust-title">
      <div className="section-inner">
        <Reveal as="div" className="section-heading">
          <p className="eyebrow eyebrow-dark">{landingContent.trust.eyebrow}</p>
          <h2 id="trust-title">{landingContent.trust.title}</h2>
          <p>{landingContent.trust.description}</p>
        </Reveal>

        <div className="trust-grid">
          {landingContent.trust.highlights.map((item, index) => (
            <Reveal
              as="article"
              className="trust-item"
              key={item.title}
              delayMs={index * 90}
            >
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
