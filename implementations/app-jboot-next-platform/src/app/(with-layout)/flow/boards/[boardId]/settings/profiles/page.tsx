import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import ProfilesSettings from "@/modules/kanban/components/ProfilesSettings";

export const metadata: Metadata = {
  title: "Perfis | Flow",
};

export default async function FlowBoardProfilesSettingsPage({
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
            <ProfilesSettings boardId={boardId} />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
