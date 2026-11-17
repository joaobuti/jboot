import React from "react";
import { Metadata } from "next";
import { Col, Container, Row } from "reactstrap";
import BoardListPanel from "@/modules/kanban/components/BoardListPanel";

export const metadata: Metadata = {
  title: "Boards | JBoot",
};

export default function FlowBoardsPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col>
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">Boards</h4>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <BoardListPanel />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
