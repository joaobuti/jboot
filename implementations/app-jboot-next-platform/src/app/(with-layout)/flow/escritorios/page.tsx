import { Metadata } from "next";
import { Container } from "reactstrap";
import OfficesAdminPage from "@/modules/kanban/components/offices/OfficesAdminPage";

export const metadata: Metadata = {
  title: "Escritórios | JBoot Flow"
};

export default function FlowEscritoriosPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <OfficesAdminPage />
      </Container>
    </div>
  );
}
