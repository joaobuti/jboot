import { Badge, Card, CardBody, Col, Row } from "reactstrap";
import type { DataJudProcessQueryResponse } from "../lib/juridico-api";

function dateTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Não informado";
}

export default function DataJudProcessSummary({ result }: { result: DataJudProcessQueryResponse }) {
  const process = result.process;
  return (
    <Card>
      <CardBody>
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <h5 className="card-title mb-0" tabIndex={-1}>Resultado da consulta</h5>
          <Badge color="primary">{process.tribunal}</Badge>
          <Badge color="secondary">DataJud</Badge>
        </div>
        <p className="text-muted small">
          Capturado em {dateTime(result.capturedAt)} · Última atualização {dateTime(process.dataUltimaAtualizacao)}
          {process.sincronizadoEm ? ` · Sincronizado no CNJ em ${dateTime(process.sincronizadoEm)}` : ""}
        </p>
        <Row className="g-3">
          <Col md={6}><strong>Classe</strong><div>{process.classe?.nome || "Não informada"}</div></Col>
          <Col md={6}><strong>Órgão julgador</strong><div>{process.orgaoJulgador?.nome || "Não informado"}</div></Col>
          <Col md={3}><strong>Grau</strong><div>{process.grau || "Não informado"}</div></Col>
          <Col md={3}><strong>Ajuizamento</strong><div>{dateTime(process.dataAjuizamento)}</div></Col>
          <Col md={3}><strong>Formato</strong><div>{process.formato?.nome || "Não informado"}</div></Col>
          <Col md={3}><strong>Sistema</strong><div>{process.sistema?.nome || "Não informado"}</div></Col>
          <Col md={12}><strong>Assuntos</strong><div>{process.assuntos.map((item) => item.nome).join(", ") || "Não informados"}</div></Col>
        </Row>
        {process.datajudId ? (
          <p className="text-muted small mt-3 mb-0">Identificador no DataJud: <code>{process.datajudId}</code></p>
        ) : null}
      </CardBody>
    </Card>
  );
}
