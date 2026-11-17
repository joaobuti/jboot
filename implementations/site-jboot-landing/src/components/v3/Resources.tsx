import { v3Content } from "@/content/v3-content";
import { Reveal } from "@/components/Reveal";

export function Resources() {
  return (
    <section className="section bg-light" id={v3Content.resources.id}>
      <div className="container">
        <h1 className="mb-5 fw-semibold text-center lh-base">{v3Content.resources.headline}</h1>

        <div className="row g-3">
          {v3Content.resources.items.map((item, index) => (
            <div className="col-lg-4" key={item.title}>
              <Reveal as="a" href={item.href} className="card h-100 text-decoration-none" delayMs={index * 90}>
                <div className="card-body">
                  <h5 className="text-body">{item.title}</h5>
                  <p className="text-muted fs-14 mb-3">{item.description}</p>
                  <span className="link-success">
                    Saiba mais <i className="ri-arrow-right-line align-bottom ms-1" />
                  </span>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
