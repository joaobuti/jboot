import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import TagsStatusSettings from "@/modules/kanban/components/TagsStatusSettings";

export const metadata: Metadata = {
  title: "Tags e Status | Flow",
};

export default async function FlowBoardTagsStatusSettingsPage({
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
            <TagsStatusSettings boardId={boardId} />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
