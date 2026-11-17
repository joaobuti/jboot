import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function Hero() {
  return (
    <section className="section pb-0 hero-section" id="hero">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8 col-sm-10">
            <Reveal as="div" className="text-center mt-lg-5 pt-5">
              <h1 className="display-6 fw-semibold mb-3 lh-base">{v2Content.hero.headline}</h1>
              <p className="lead text-muted lh-base">{v2Content.hero.subheadline}</p>

              <div className="d-flex gap-2 justify-content-center mt-4 flex-wrap">
                <a href={v2Content.hero.primaryCta.href} className="btn btn-primary">
                  {v2Content.hero.primaryCta.label} <i className="ri-arrow-right-line align-middle ms-1" />
                </a>
                <a href={v2Content.hero.secondaryCta.href} className="btn btn-outline-secondary">
                  {v2Content.hero.secondaryCta.label}
                </a>
              </div>
            </Reveal>

            <div className="module-stack-panel mt-5 pt-sm-4">
              <div className="row justify-content-center module-stack g-3">
                {v2Content.hero.modules.map((module, index) => (
                  <div className="col-sm-4" key={module.title}>
                    <Reveal as="div" className="module-card text-center" delayMs={index * 100}>
                      <h5 className="text-white mb-1">{module.title}</h5>
                      <p className="mb-0 text-white-50 small">{module.description}</p>
                    </Reveal>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
