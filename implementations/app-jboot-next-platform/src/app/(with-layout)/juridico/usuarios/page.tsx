import { Metadata } from "next";
import { Container } from "reactstrap";
import { ModuleUserManager } from "@/components/Common/ModuleUserManager";

export const metadata: Metadata = {
  title: "Usuários | JBoot Jurídico"
};

export default function JuridicoUsuariosPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <ModuleUserManager />
      </Container>
    </div>
  );
}
