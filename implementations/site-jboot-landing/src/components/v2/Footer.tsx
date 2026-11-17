import { v2Content } from "@/content/v2-content";
import { routes } from "@/lib/routes";

export function Footer() {
  return (
    <footer className="custom-footer bg-dark py-5 position-relative">
      <div className="container">
        <div className="row">
          <div className="col-lg-4 mt-4">
            <div className="d-flex align-items-center gap-2 text-white fw-bold fs-18">
              <img className="rounded" src="/icons/apple-touch-icon.png" alt="" width={32} height={32} />
              {v2Content.brand}
            </div>
            <p className="text-white-50 mt-3 fs-13 mb-0">
              Ecossistema de aplicacoes para operacao e gestao, organizado por modulos.
            </p>
          </div>

          <div className="col-lg-7 ms-lg-auto">
            <div className="row">
              {v2Content.footer.columns.map(column => (
                <div className="col-sm-4 mt-4" key={column.title}>
                  <h5 className="text-white mb-0 fs-15">{column.title}</h5>
                  <ul className="list-unstyled footer-list mt-3">
                    {column.links.map(link => (
                      <li key={link.href}>
                        <a href={link.href}>{link.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="row text-center text-sm-start align-items-center mt-5 pt-4 border-top border-secondary">
          <div className="col-sm-6">
            <p className="text-white-50 mb-0 small">© {new Date().getFullYear()} JBoot</p>
          </div>
          <div className="col-sm-6">
            <div className="text-sm-end mt-3 mt-sm-0">
              <a href={routes.home} className="text-white-50 small">
                Ver versao v1
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
