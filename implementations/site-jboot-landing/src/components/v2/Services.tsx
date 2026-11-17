import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function Services() {
  return (
    <section className="section" id={v2Content.services.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="text-center mb-5">
              <h6 className="text-uppercase text-success fw-semibold fs-13">{v2Content.services.eyebrow}</h6>
              <h1 className="mb-3 fw-semibold lh-base">{v2Content.services.headline}</h1>
              <p className="text-muted">{v2Content.services.subheadline}</p>
            </div>
          </div>
        </div>

        <div className="row g-3">
          {v2Content.services.items.map((item, index) => (
            <div className="col-lg-4" key={item.title}>
              <Reveal as="div" className="d-flex p-3" delayMs={(index % 3) * 90}>
                <div className="flex-shrink-0 me-3">
                  <div className="avatar-sm icon-effect">
                    <div className="avatar-title bg-transparent text-success rounded-circle">
                      <i className={`${v2Content.services.icons[index]} fs-36`} />
                    </div>
                  </div>
                </div>
                <div className="flex-grow-1">
                  <h5 className="fs-18">{item.title}</h5>
                  <p className="text-muted my-2">{item.description}</p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
