import { AiFirstFooter } from "./AiFirstFooter";
import { AiFirstHeader } from "./AiFirstHeader";
import { AiFirstHero } from "./AiFirstHero";
import { AiArchitectureSection } from "@/components/shared/AiArchitectureSection";
import { ArchitectureSection } from "./ArchitectureSection";
import { ProcessSection } from "./ProcessSection";
import { SolutionsSection } from "./SolutionsSection";

const brandAsset = "/brand/jb-cyan.jpg";

export function AiFirstLanding() {
  return (
    <div className="jb-ai-home">
      <AiFirstHeader brandAsset={brandAsset} />
      <main>
        <AiFirstHero brandAsset={brandAsset} />
        <AiArchitectureSection />
        <SolutionsSection />
        <ArchitectureSection />
        <ProcessSection />
      </main>
      <AiFirstFooter brandAsset={brandAsset} />
    </div>
  );
}
