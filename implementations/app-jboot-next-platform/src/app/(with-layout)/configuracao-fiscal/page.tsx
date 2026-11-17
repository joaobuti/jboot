import { Metadata } from "next";
import { Container } from "reactstrap";
import { ModuleFiscalConfig } from "@/components/Common/ModuleFiscalConfig";

export const metadata: Metadata = {
  title: "Configuração Fiscal | JBoot PDV"
};

export default function ConfiguracaoFiscalPage() {
  return (
    <div className="page-content">
      <Container fluid>
        <ModuleFiscalConfig />
      </Container>
    </div>
  );
}
