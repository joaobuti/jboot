import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function Trust() {
  return (
    <div className="pt-5 mt-3" id={v2Content.trust.id}>
      <div className="container">
        <Reveal as="h5" className="fs-20 text-center mb-4">
          {v2Content.trust.headline}
        </Reveal>
        <div className="row g-3 mb-4">
          {v2Content.trust.items.map((item, index) => (
            <div className="col-lg-3 col-sm-6" key={item.title}>
              <Reveal as="div" className="card h-100 border-0 shadow-sm" delayMs={index * 80}>
                <div className="card-body">
                  <h6 className="fw-semibold">{item.title}</h6>
                  <p className="text-muted small mb-0">{item.description}</p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
