import { Areas } from "@/components/v3/Areas";
import { BackToTop } from "@/components/v3/BackToTop";
import { Capabilities } from "@/components/v3/Capabilities";
import { Clients } from "@/components/v3/Clients";
import { EcosystemStat } from "@/components/v3/EcosystemStat";
import { FinalCta } from "@/components/v3/FinalCta";
import { Footer } from "@/components/v3/Footer";
import { Header } from "@/components/v3/Header";
import { Hero } from "@/components/v3/Hero";
import { Process } from "@/components/v3/Process";
import { Resources } from "@/components/v3/Resources";
import { Squads } from "@/components/v3/Squads";
import { AiArchitectureSection } from "@/components/shared/AiArchitectureSection";

export default function V3Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <AiArchitectureSection />
        <Process />
        <Areas />
        <EcosystemStat />
        <Clients />
        <Capabilities />
        <Squads />
        <Resources />
        <FinalCta />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
