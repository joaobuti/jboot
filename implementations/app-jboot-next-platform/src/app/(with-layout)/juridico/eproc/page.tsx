import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import CredenciaisSection from "@/modules/juridico/components/CredenciaisSection";
import EprocSessionSetup from "@/modules/juridico/components/EprocSessionSetup";

export const metadata: Metadata = {
  title: "eProc | JBoot Jurídico",
};

export default function EprocPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">eProc TJSC — 1º Grau</h4>
            </div>
          </Col>
        </Row>
        <Row className="g-3">
          <Col lg={6}>
            <CredenciaisSection portalSlug="eproc" />
          </Col>
          <Col lg={6}>
            <EprocSessionSetup />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
