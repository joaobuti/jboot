import { Applications } from "@/components/v4/Applications";
import { FinalCta } from "@/components/v4/FinalCta";
import { FirstProof } from "@/components/v4/FirstProof";
import { Footer } from "@/components/v4/Footer";
import { Header } from "@/components/v4/Header";
import { Hero } from "@/components/v4/Hero";
import { HubModel } from "@/components/v4/HubModel";
import { AiArchitectureSection } from "@/components/shared/AiArchitectureSection";

export default function V4Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <AiArchitectureSection />
        <FirstProof />
        <HubModel />
        <Applications />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
