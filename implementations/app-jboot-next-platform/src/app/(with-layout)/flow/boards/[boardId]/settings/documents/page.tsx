import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import DocumentTypesSettings from "@/modules/kanban/components/DocumentTypesSettings";

export const metadata: Metadata = {
  title: "Documentos | Flow",
};

export default async function FlowBoardDocumentsSettingsPage({
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
            <DocumentTypesSettings boardId={boardId} />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
