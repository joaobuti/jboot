import { Clients } from "@/components/v2/Clients";
import { EcosystemOrg } from "@/components/v2/EcosystemOrg";
import { Faq } from "@/components/v2/Faq";
import { Features } from "@/components/v2/Features";
import { FinalCta } from "@/components/v2/FinalCta";
import { Footer } from "@/components/v2/Footer";
import { Header } from "@/components/v2/Header";
import { Hero } from "@/components/v2/Hero";
import { Services } from "@/components/v2/Services";
import { Tiers } from "@/components/v2/Tiers";
import { Trust } from "@/components/v2/Trust";
import { UseCases } from "@/components/v2/UseCases";
import { AiArchitectureSection } from "@/components/shared/AiArchitectureSection";

export default function V2Page() {
  return (
    <>
      <Header />
      <main style={{ paddingTop: 56 }}>
        <Hero />
        <AiArchitectureSection />
        <Trust />
        <Clients />
        <Services />
        <Features />
        <Tiers />
        <Faq />
        <UseCases />
        <EcosystemOrg />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
