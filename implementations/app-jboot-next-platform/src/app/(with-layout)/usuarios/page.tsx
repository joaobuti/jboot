import { Metadata } from "next";
import { Container } from "reactstrap";
import { ModuleUserManager } from "@/components/Common/ModuleUserManager";

export const metadata: Metadata = {
  title: "Usuários | JBoot PDV"
};

export default function PdvUsuariosPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <ModuleUserManager />
      </Container>
    </div>
  );
}
