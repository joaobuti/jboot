import { Metadata } from "next";
import { Container } from "reactstrap";
import ProcessImportPage from "@/modules/kanban/components/ProcessImportPage";

export const metadata: Metadata = { title: "Importar processos | JBoot Flow" };

export default function FlowImportarProcessosPage() {
  return <div className="page-content"><Container fluid><ProcessImportPage /></Container></div>;
}
