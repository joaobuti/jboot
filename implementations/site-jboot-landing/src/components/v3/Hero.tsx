import { v3Content } from "@/content/v3-content";
import { Reveal } from "@/components/Reveal";

export function Hero() {
  return (
    <section className="v3-hero-section bg-light pb-0" id="hero">
      <div className="container">
        <div className="row justify-content-between align-items-center">
          <div className="col-lg-6">
            <Reveal as="div">
              <h1 className="display-6 fw-semibold mb-3 lh-base">{v3Content.hero.headline}</h1>
              <p className="lead text-muted lh-base mb-4">{v3Content.hero.subheadline}</p>

              <nav className="quick-nav-panel" aria-label={v3Content.hero.quickNavLabel}>
                <div className="row g-0">
                  {v3Content.hero.quickNav.map(item => (
                    <div className="col-6 col-md-3 nav-pill" key={item.label}>
                      <a href={item.href} className="d-block text-center py-3 text-body text-decoration-none fw-medium">
                        {item.label}
                      </a>
                    </div>
                  ))}
                </div>
              </nav>

              <ul className="list-inline mb-0 mt-3 fs-13">
                <li className="list-inline-item text-success fw-semibold">
                  <i className="ri-fire-line align-middle" /> {v3Content.hero.trendingLabel}
                </li>
                {v3Content.hero.trending.map(tag => (
                  <li className="list-inline-item" key={tag}>
                    <a href="#capacidades">{tag},</a>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <a href={v3Content.hero.primaryCta.href} className="btn btn-primary">
                  {v3Content.hero.primaryCta.label} <i className="ri-arrow-right-line align-bottom ms-1" />
                </a>
              </div>
            </Reveal>
          </div>

          <div className="col-lg-5">
            <div className="position-relative module-showcase text-center mt-5 mt-lg-0">
              <Reveal as="div" className="card p-3 rounded shadow-lg floating-card inquiry-box" delayMs={120}>
                <div className="d-flex align-items-center">
                  <div className="avatar-sm flex-shrink-0 me-3">
                    <div className="avatar-title bg-primary-subtle text-success rounded fs-18">
                      <i className="ri-shield-check-line" />
                    </div>
                  </div>
                  <h6 className="fs-13 lh-base mb-0">Acesso centralizado por contrato</h6>
                </div>
              </Reveal>

              <Reveal as="div" className="card p-3 rounded shadow-lg floating-card application-box" delayMs={220}>
                <h6 className="fs-13 lh-base mb-2">Modulos habilitados</h6>
                <div className="d-flex gap-2">
                  <span className="badge bg-primary-subtle text-success">PDV</span>
                  <span className="badge bg-primary-subtle text-success">Juridico</span>
                  <span className="badge bg-primary-subtle text-success">Identity</span>
                </div>
              </Reveal>

              <div className="hero-visual-panel" />

              <div className="circle-effect" aria-hidden="true">
                <div className="circle" />
                <div className="circle2" />
                <div className="circle3" />
                <div className="circle4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
