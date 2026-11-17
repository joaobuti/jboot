import { Metadata } from "next";
import { Container } from "reactstrap";
import FlowCustomersPage from "@/modules/kanban/components/customers/FlowCustomersPage";

export const metadata: Metadata = { title: "Clientes | JBoot Flow" };

export default function FlowClientesPage() {
  return <div className="page-content"><Container fluid><FlowCustomersPage /></Container></div>;
}
