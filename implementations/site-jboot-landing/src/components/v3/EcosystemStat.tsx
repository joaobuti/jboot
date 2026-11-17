import { v3Content } from "@/content/v3-content";
import { Reveal } from "@/components/Reveal";

export function EcosystemStat() {
  return (
    <section className="section" id={v3Content.ecosystemStat.id}>
      <div className="container">
        <Reveal as="div" className="card bg-primary border-0 shadow-lg">
          <div className="card-body p-4 p-lg-5 text-center">
            <h2 className="text-white mb-3">{v3Content.ecosystemStat.headline}</h2>
            <p className="text-white-50 mb-0 mx-auto" style={{ maxWidth: 720 }}>
              {v3Content.ecosystemStat.description}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
