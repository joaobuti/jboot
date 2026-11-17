import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function Tiers() {
  return (
    <section className="section bg-light" id={v2Content.tiers.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="text-center mb-5">
              <h3 className="mb-3 fw-semibold">{v2Content.tiers.headline}</h3>
              <p className="text-muted mb-0">{v2Content.tiers.subheadline}</p>
            </div>
          </div>
        </div>

        <div className="row gy-4">
          {v2Content.tiers.items.map((tier, index) => (
            <div className="col-lg-4" key={tier.title}>
              <Reveal
                as="div"
                className={`card plan-box mb-0 position-relative h-100 ${tier.highlighted ? "highlighted" : ""}`}
                delayMs={index * 100}
              >
                {tier.highlighted && (
                  <span className="badge badge-popular rounded-pill">Mais contratado</span>
                )}
                <div className="card-body p-4 m-2">
                  <div className="d-flex align-items-center">
                    <div className="flex-grow-1">
                      <h5 className="mb-1 fw-semibold">{tier.title}</h5>
                      <p className="text-muted mb-0 small">{tier.subtitle}</p>
                    </div>
                    <div className="avatar-sm">
                      <div className="avatar-title bg-light rounded-circle text-primary">
                        <i className={`${tier.icon} fs-20`} />
                      </div>
                    </div>
                  </div>

                  <ul className="list-unstyled text-muted vstack gap-2 mt-4">
                    {tier.checklist.map(item => (
                      <li key={item}>
                        <div className="d-flex">
                          <div className="flex-shrink-0 text-success me-1">
                            <i className="ri-checkbox-circle-fill fs-15 align-middle" />
                          </div>
                          <div className="flex-grow-1">{item}</div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4">
                    <a
                      href={tier.cta.href}
                      className={`btn w-100 ${tier.highlighted ? "btn-primary" : "btn-soft-primary"}`}
                    >
                      {tier.cta.label}
                    </a>
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
