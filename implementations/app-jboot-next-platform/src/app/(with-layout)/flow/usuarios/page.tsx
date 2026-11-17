import { Metadata } from "next";
import { Container } from "reactstrap";
import { ModuleUserManager } from "@/components/Common/ModuleUserManager";

export const metadata: Metadata = {
  title: "Usuários | JBoot Flow"
};

export default function FlowUsuariosPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <ModuleUserManager />
      </Container>
    </div>
  );
}
