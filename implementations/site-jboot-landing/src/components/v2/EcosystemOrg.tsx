import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function EcosystemOrg() {
  return (
    <section className="section" id={v2Content.ecosystemOrg.id}>
      <div className="container">
        <h3 className="mb-5 fw-semibold text-center">{v2Content.ecosystemOrg.headline}</h3>

        <div className="row g-4">
          {v2Content.ecosystemOrg.items.map((item, index) => (
            <div className="col-lg-4" key={item.title}>
              <Reveal as="div" className="card h-100 border-0 shadow-sm text-center p-3" delayMs={index * 100}>
                <div className="card-body">
                  <div className="avatar-md mx-auto mb-3">
                    <div className="avatar-title bg-light rounded-circle text-success">
                      <i className={`${item.icon} fs-1`} />
                    </div>
                  </div>
                  <h5>{item.title}</h5>
                  <p className="text-muted mb-0 small">{item.description}</p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
