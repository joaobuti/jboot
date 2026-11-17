import { v3Content } from "@/content/v3-content";
import { Reveal } from "@/components/Reveal";

export function Process() {
  return (
    <section className="section" id={v3Content.process.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="text-center mb-5">
              <h1 className="mb-3 fw-semibold lh-base">{v3Content.process.headline}</h1>
              <p className="text-muted">{v3Content.process.description}</p>
            </div>
          </div>
        </div>

        <div className="row g-3">
          {v3Content.process.steps.map((step, index) => (
            <div className="col-lg-3 col-md-6" key={step.title}>
              <Reveal as="div" className="card shadow-sm h-100" delayMs={index * 90}>
                <div className="card-body p-4">
                  <h1 className="fw-bold display-5 mb-4 text-success position-relative">
                    <span className="step-icon-effect" />
                    <span>{index + 1}</span>
                  </h1>
                  <h6 className="fs-17 mb-2">{step.title}</h6>
                  <p className="text-muted mb-0 fs-15">{step.description}</p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
