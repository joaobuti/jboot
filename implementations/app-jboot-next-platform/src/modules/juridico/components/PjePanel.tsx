"use client";

import { useCallback, useState } from "react";
import { Alert, Col, Row } from "reactstrap";
import CredenciaisSection from "@/modules/juridico/components/CredenciaisSection";
import PjeComunicacoesList from "@/modules/juridico/components/PjeComunicacoesList";
import PjeMonitoringSetup from "@/modules/juridico/components/PjeMonitoringSetup";

export default function PjePanel() {
  const [reloadToken, setReloadToken] = useState(0);

  const handleSyncFinished = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return (
    <>
      <Row>
        <Col>
          <Alert color="info" className="mb-3">
            A consulta de comunicações do DJEN (Comunica PJe/CNJ) é pública e não usa credenciais.
            As credenciais abaixo ficam guardadas cifradas por cliente para escopos autenticados
            futuros — os endpoints de inclusão e cancelamento de comunicações são de uso exclusivo
            dos tribunais.
          </Alert>
        </Col>
      </Row>
      <Row className="g-3">
        <Col lg={8}>
          <PjeMonitoringSetup onSyncFinished={handleSyncFinished} />
        </Col>
        <Col lg={4}>
          <CredenciaisSection portalSlug="pje" />
        </Col>
        <Col lg={12}>
          <PjeComunicacoesList reloadToken={reloadToken} />
        </Col>
      </Row>
    </>
  );
}
