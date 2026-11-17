import { Metadata } from "next";
import { Container } from "reactstrap";
import CustomerValidationSettingsPage from "@/modules/kanban/components/customers/CustomerValidationSettingsPage";

export const metadata: Metadata = { title: "Validação de cadastro | JBoot Flow" };

export default function FlowCustomerValidationSettingsPage() {
  return <div className="page-content"><Container fluid><CustomerValidationSettingsPage /></Container></div>;
}
