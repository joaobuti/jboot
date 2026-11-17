import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function Features() {
  return (
    <section className="section bg-light py-5">
      <div className="container">
        {v2Content.features.map((feature, index) => (
          <div
            className={`row align-items-center gy-4 ${index > 0 ? "mt-5 pt-lg-4" : ""}`}
            key={feature.title}
          >
            <div className={`col-lg-5 col-sm-7 mx-auto ${index % 2 === 1 ? "order-2 order-lg-1" : ""}`}>
              <Reveal
                as="div"
                className="d-flex align-items-center justify-content-center rounded-4"
                style={{ minHeight: 220, background: "linear-gradient(135deg, #00d9ff22, #04758b22)" }}
              >
                <i className="ri-shield-check-line" style={{ fontSize: "4rem", color: "#04758b" }} />
              </Reveal>
            </div>
            <div className={`col-lg-7 ${index % 2 === 1 ? "order-1 order-lg-2" : ""}`}>
              <Reveal as="div" className="text-muted">
                <h6 className="fs-12 text-uppercase text-success">{feature.eyebrow}</h6>
                <h3 className="mb-3 fs-20">{feature.title}</h3>
                <p className="mb-4 fs-16">{feature.description}</p>

                <div className="vstack gap-2">
                  {feature.checklist.map(item => (
                    <div className="d-flex align-items-center" key={item}>
                      <div className="flex-shrink-0 me-2">
                        <div className="avatar-xs icon-effect">
                          <div className="avatar-title bg-transparent text-success rounded-circle h2 mb-0">
                            <i className="ri-check-fill" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-grow-1">
                        <p className="mb-0">{item}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
