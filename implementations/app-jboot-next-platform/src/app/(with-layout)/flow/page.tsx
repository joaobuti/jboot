import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import MetricsHomePanel from "@/modules/kanban/components/MetricsHomePanel";

export const metadata: Metadata = {
  title: "Flow | JBoot",
};

export default function FlowHomePage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">Home</h4>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <MetricsHomePanel />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
