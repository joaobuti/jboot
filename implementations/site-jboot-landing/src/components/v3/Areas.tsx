import { v3Content } from "@/content/v3-content";
import { Reveal } from "@/components/Reveal";

export function Areas() {
  return (
    <section className="section bg-light" id={v3Content.areas.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-7">
            <div className="text-center mb-5">
              <h6 className="text-uppercase text-success fw-semibold fs-13">{v3Content.areas.eyebrow}</h6>
              <h1 className="mb-3 fw-semibold lh-base">{v3Content.areas.headline}</h1>
              <p className="text-muted mb-0">{v3Content.areas.description}</p>
            </div>
          </div>
        </div>

        <div className="row justify-content-center g-3">
          {v3Content.areas.items.map((item, index) => (
            <div className="col-lg-3 col-md-6" key={item.title}>
              <Reveal as="div" className="card shadow-none text-center py-3 h-100" delayMs={(index % 4) * 80}>
                <div className="card-body py-4">
                  <div className="avatar-sm mb-3 mx-auto">
                    <div className="avatar-title bg-transparent text-success rounded-circle">
                      <i className={`${v3Content.areas.icons[index]} fs-1`} />
                    </div>
                  </div>
                  <h5 className="fs-17 pt-1">{item.title}</h5>
                  <p className="mb-0 text-muted small">{item.description}</p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
