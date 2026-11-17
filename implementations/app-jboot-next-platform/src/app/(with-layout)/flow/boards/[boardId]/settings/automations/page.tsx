import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import AutomationRulesSettings from "@/modules/kanban/components/AutomationRulesSettings";

export const metadata: Metadata = {
  title: "Automacoes | Flow",
};

export default async function FlowBoardAutomationsSettingsPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <AutomationRulesSettings boardId={boardId} />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
