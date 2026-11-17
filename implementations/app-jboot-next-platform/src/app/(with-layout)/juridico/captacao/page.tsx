import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import CaptacaoImportPanel from "@/modules/juridico/components/CaptacaoImportPanel";

export const metadata: Metadata = {
  title: "Captação | JBoot Jurídico",
};

export default function CaptacaoPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">Captação</h4>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <CaptacaoImportPanel />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
