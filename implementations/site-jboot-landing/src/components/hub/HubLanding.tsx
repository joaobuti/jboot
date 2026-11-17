import { HubFooter } from "./HubFooter";
import { HubFoundationsSection } from "./HubFoundationsSection";
import { HubHeader } from "./HubHeader";
import { HubHero } from "./HubHero";
import { AiArchitectureSection } from "@/components/shared/AiArchitectureSection";
import { HubProcessSection } from "./HubProcessSection";
import { HubSolutionsSection } from "./HubSolutionsSection";
import { hubHomePages, type HubLocale } from "@/content/hub-home-content";

const brandAsset = "/brand/jb-cyan-white.png";

export function HubLanding({ locale = "pt" }: { locale?: HubLocale }) {
  const content = hubHomePages[locale];

  return (
    <div className="jb-ai-home jb-hub-home">
      <HubHeader brandAsset={brandAsset} content={content} locale={locale} />
      <main>
        <HubHero brandAsset={brandAsset} content={content} />
        <AiArchitectureSection content={content.pipeline} locale={locale} />
        <HubSolutionsSection content={content} />
        <HubFoundationsSection content={content} />
        <HubProcessSection content={content} />
      </main>
      <HubFooter brandAsset={brandAsset} content={content} />
    </div>
  );
}
