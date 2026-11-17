import Image from "next/image";
import { aiFirstHomeContent as content } from "@/content/ai-first-home-content";

export function AiFirstFooter({ brandAsset }: { brandAsset: string }) {
  return (
    <>
      <section className="ai-section ai-final-cta">
        <div className="ai-container ai-final-cta__inner">
          <div><h2>{content.finalCta.title}</h2><p>{content.finalCta.description}</p></div>
          <a className="ai-button ai-button--dark" href={content.finalCta.action.href}>{content.finalCta.action.label}</a>
        </div>
      </section>
      <footer className="ai-footer">
        <div className="ai-container">
          <div className="ai-brand"><Image src={brandAsset} alt="" width={28} height={28} /><span>JBoot</span></div>
          <span>© {new Date().getFullYear()} JBoot · aplicações e engenharia AI-first</span>
        </div>
      </footer>
    </>
  );
}
