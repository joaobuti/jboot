import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import CredenciaisSection from "@/modules/juridico/components/CredenciaisSection";
import SchedulingConfigSection from "@/modules/juridico/components/SchedulingConfigSection";

export const metadata: Metadata = {
  title: "PROJUDI | JBoot Jurídico",
};

export default function ProjudiPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">Projudi — Sistema de Processo Judicial</h4>
            </div>
          </Col>
        </Row>
        <Row>
          <Col lg={6}>
            <CredenciaisSection portalSlug="projudi" />
          </Col>
          <Col lg={6}>
            <SchedulingConfigSection portalSlug="projudi" />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
