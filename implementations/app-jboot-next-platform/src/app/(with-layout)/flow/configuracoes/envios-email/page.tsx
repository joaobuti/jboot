import { Metadata } from "next";
import { Container } from "reactstrap";
import EmailDispatchesSettingsPage from "@/modules/kanban/components/automation/EmailDispatchesSettingsPage";

export const metadata: Metadata = { title: "Envios de e-mail | JBoot Flow" };

export default function FlowEmailDispatchesPage() {
  return <div className="page-content"><Container fluid><EmailDispatchesSettingsPage /></Container></div>;
}
