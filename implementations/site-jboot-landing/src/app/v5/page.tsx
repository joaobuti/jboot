import { Architecture } from "@/components/v5/Architecture";
import { Applications } from "@/components/v5/Applications";
import { FinalCta } from "@/components/v5/FinalCta";
import { Footer } from "@/components/v5/Footer";
import { Header } from "@/components/v5/Header";
import { Hero } from "@/components/v5/Hero";
import { HubPilot } from "@/components/v5/HubPilot";
import { OperatingModel } from "@/components/v5/OperatingModel";
import { AiArchitectureSection } from "@/components/shared/AiArchitectureSection";

export default function V5Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <AiArchitectureSection />
        <HubPilot />
        <Applications />
        <OperatingModel />
        <Architecture />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
