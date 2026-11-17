import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import PjePanel from "@/modules/juridico/components/PjePanel";

export const metadata: Metadata = {
  title: "PJE | JBoot Jurídico",
};

export default function PjePage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">PJE — Comunicações DJEN</h4>
            </div>
          </Col>
        </Row>
        <PjePanel />
      </Container>
    </div>
  );
}
