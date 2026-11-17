import React, { Suspense } from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import BoardView from "@/modules/kanban/components/BoardView";

export const metadata: Metadata = {
  title: "Board | Flow",
};

export default async function FlowBoardPage({
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
            <Suspense>
              <BoardView boardId={boardId} />
            </Suspense>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
