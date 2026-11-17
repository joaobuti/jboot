import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jurídico | JBoot",
};

export default function JuridicoHomePage() {
  return (
    <div className="page-content">
      <div className="container-fluid">
        <div className="row">
          <div className="col">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">Jurídico</h4>
            </div>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-xl-4 col-md-6">
            <div className="card h-100">
              <div className="card-body d-flex flex-column">
                <div className="d-flex align-items-center mb-3">
                  <div className="avatar-sm me-3 flex-shrink-0">
                    <span className="avatar-title rounded bg-soft-primary text-primary fs-22">
                      <i className="ri-search-eye-line" />
                    </span>
                  </div>
                  <div>
                    <h5 className="card-title mb-1">Consulta processual</h5>
                    <span className="text-muted">Consulta manual de dados oficiais do DataJud.</span>
                  </div>
                </div>
                <div className="mt-auto pt-3">
                  <Link href="/juridico/consultas/processo" className="btn btn-sm btn-primary w-100">
                    Consultar
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="col-xl-4 col-md-6">
            <div className="card h-100">
              <div className="card-body d-flex flex-column">
                <div className="d-flex align-items-center mb-3">
                  <div className="avatar-sm me-3 flex-shrink-0">
                    <span className="avatar-title rounded bg-soft-primary text-primary fs-22">
                      <i className="ri-inbox-archive-line" />
                    </span>
                  </div>
                  <div>
                    <h5 className="card-title mb-1">Captação</h5>
                    <span className="text-muted">Importação e triagem de oportunidades.</span>
                  </div>
                </div>

                <div className="mt-auto pt-3">
                  <Link href="/juridico/captacao" className="btn btn-sm btn-primary w-100">
                    Acessar
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
