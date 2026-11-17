import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import DataJudProcessQueryPanel from "@/modules/juridico/components/DataJudProcessQueryPanel";

export const metadata: Metadata = { title: "Consulta processual | JBoot Jurídico" };

export default function DataJudProcessQueryPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row><Col><div className="page-title-box d-sm-flex align-items-center justify-content-between"><h4 className="mb-sm-0">Consulta processual <span className="badge bg-info-subtle text-info align-middle fs-13 ms-1">DataJud</span></h4></div></Col></Row>
        <DataJudProcessQueryPanel />
      </Container>
    </div>
  );
}
