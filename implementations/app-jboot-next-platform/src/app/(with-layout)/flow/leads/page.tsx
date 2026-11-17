import { Metadata } from "next";
import { Container } from "reactstrap";
import LeadsAdminPage from "@/modules/kanban/components/leads/LeadsAdminPage";

export const metadata: Metadata = {
  title: "Leads | JBoot Flow"
};

export default function FlowLeadsPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <LeadsAdminPage />
      </Container>
    </div>
  );
}
