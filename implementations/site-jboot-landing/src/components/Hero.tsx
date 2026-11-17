import { landingContent } from "@/content/landing-content";
import { Reveal } from "@/components/Reveal";

export function Hero() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="hero-background" aria-hidden="true" />
      <div className="hero-overlay" aria-hidden="true" />

      <div className="hero-content">
        <Reveal as="p" className="eyebrow">
          Ecossistema JBoot
        </Reveal>
        <Reveal as="h1" id="hero-title" delayMs={80}>
          {landingContent.headline}
        </Reveal>
        <Reveal as="p" className="hero-copy" delayMs={160}>
          {landingContent.subheadline}
        </Reveal>

        <Reveal as="div" className="hero-actions" delayMs={240}>
          <a className="button" href={landingContent.primaryCta.href}>
            {landingContent.primaryCta.label}
          </a>
          <a className="button button-secondary" href={landingContent.secondaryCta.href}>
            {landingContent.secondaryCta.label}
          </a>
        </Reveal>

        <Reveal as="ul" className="proof-list" aria-label="Destaques JBoot" delayMs={320}>
          {landingContent.proofPoints.map(item => (
            <li key={item}>{item}</li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
