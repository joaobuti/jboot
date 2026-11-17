import Image from "next/image";
import type { HubHomeContent } from "@/content/hub-home-content";

export function HubHero({
  brandAsset,
  content,
}: {
  brandAsset: string;
  content: HubHomeContent;
}) {
  return (
    <section id="top" className="ai-hero">
      <div className="ai-circuit-grid" aria-hidden="true" />
      <div className="ai-hero__glow" aria-hidden="true" />
      <div className="ai-container ai-hero__grid">
        <div>
          <p className="ai-badge"><span />{content.hero.eyebrow}</p>
          <h1>
            {content.hero.title.firstLine}<br />
            com <span className="hub-highlight">{content.hero.title.emphasis}</span><br />
            {content.hero.title.lastLine}
          </h1>
          <p className="ai-hero__lead">{content.hero.description}</p>
          <div className="ai-actions">
            <a className="ai-button ai-button--dark" href={content.hero.primaryCta.href}>{content.hero.primaryCta.label}</a>
            <a className="ai-button ai-button--outline" href={content.hero.secondaryCta.href}>{content.hero.secondaryCta.label}</a>
          </div>
        </div>
        <div className="ai-hero__visual">
          <div className="ai-hero__image">
            <Image
              src={brandAsset}
              alt="Identidade visual JBoot sobre uma malha de circuitos"
              width={1280}
              height={720}
              priority
            />
          </div>
          <div className="ai-signal-grid">
            {content.hero.signals.map(([value, label]) => (
              <div key={value}><strong>{value}</strong><span>{label}</span></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
