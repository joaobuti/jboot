import { Metadata } from "next";
import { Container } from "reactstrap";
import ClaudeConnectorSettingsPage from "@/modules/kanban/components/claude/ClaudeConnectorSettingsPage";

export const metadata: Metadata = { title: "Conector Claude | JBoot Flow" };

export default function FlowClaudeConnectorPage() {
  return <div className="page-content"><Container fluid><ClaudeConnectorSettingsPage /></Container></div>;
}
