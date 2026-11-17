import { v3Content } from "@/content/v3-content";

export function FinalCta() {
  return (
    <section className="py-5 bg-primary position-relative">
      <div className="container">
        <div className="row align-items-center gy-4">
          <div className="col-sm">
            <h4 className="text-white mb-2">{v3Content.finalCta.headline}</h4>
            <p className="text-white-50 mb-0">{v3Content.finalCta.description}</p>
          </div>
          <div className="col-sm-auto">
            <a href={v3Content.finalCta.cta.href} className="btn btn-light">
              {v3Content.finalCta.cta.label} <i className="ri-arrow-right-line align-bottom ms-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
