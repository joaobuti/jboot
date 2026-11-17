import { v3Content } from "@/content/v3-content";
import { Reveal } from "@/components/Reveal";

export function Capabilities() {
  return (
    <section className="section bg-light" id={v3Content.capabilities.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-7">
            <div className="text-center mb-5">
              <h6 className="text-uppercase text-success fw-semibold fs-13">{v3Content.capabilities.eyebrow}</h6>
              <h1 className="mb-3 fw-semibold lh-base">{v3Content.capabilities.headline}</h1>
            </div>
          </div>
        </div>

        <div className="row g-3">
          {v3Content.capabilities.items.map((item, index) => (
            <div className="col-lg-6" key={item.title}>
              <Reveal as="div" className="card capability-card shadow-sm h-100" delayMs={(index % 4) * 80}>
                <div className="card-body">
                  <h5>{item.title}</h5>
                  <p className="text-muted mb-3">{item.description}</p>
                  <div className="hstack gap-2 flex-wrap">
                    {item.tags.map(tag => (
                      <span className="badge bg-primary-subtle text-primary" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
