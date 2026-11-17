import React from "react";
import { Metadata } from "next";
import { Container } from "reactstrap";
import BoardActionsSettings from "@/modules/kanban/components/BoardActionsSettings";

export const metadata: Metadata = { title: "Ações | Flow" };

export default async function FlowBoardActionsSettingsPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <div className="page-content"><Container fluid><BoardActionsSettings boardId={boardId} /></Container></div>;
}
