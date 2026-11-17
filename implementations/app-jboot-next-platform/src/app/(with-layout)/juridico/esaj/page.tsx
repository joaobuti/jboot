import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import CredenciaisSection from "@/modules/juridico/components/CredenciaisSection";
import SchedulingConfigSection from "@/modules/juridico/components/SchedulingConfigSection";

export const metadata: Metadata = {
  title: "ESAJ | JBoot Jurídico",
};

export default function EsajPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">ESAJ — Tribunal de Justiça de SP</h4>
            </div>
          </Col>
        </Row>
        <Row>
          <Col lg={6}>
            <CredenciaisSection portalSlug="esaj" />
          </Col>
          <Col lg={6}>
            <SchedulingConfigSection portalSlug="esaj" />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
