"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardBody, Col, FormFeedback, Input, Label, Row, Spinner } from "reactstrap";
import { formatCnj, isValidCnj } from "../lib/cnj";
import ExportToFlowModal, { ExportToFlowBoardOption, ExportToFlowOfficeOption } from "@/components/Common/ExportToFlowModal";
import DataJudOabSearchPanel from "./DataJudOabSearchPanel";
import { DataJudProcessQueryResponse, DataJudTribunal, juridicoApi } from "../lib/juridico-api";
import { describeJuridicoError } from "../lib/juridico-errors";
import DataJudMovementList from "./DataJudMovementList";
import DataJudProcessSummary from "./DataJudProcessSummary";

interface QueryError { color: "warning" | "secondary" | "danger"; message: string; requestId?: string }

export default function DataJudProcessQueryPanel() {
  const [number, setNumber] = useState("");
  const [tribunal, setTribunal] = useState("");
  const [tribunals, setTribunals] = useState<DataJudTribunal[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState("");
  const [error, setError] = useState<QueryError | null>(null);
  const [result, setResult] = useState<DataJudProcessQueryResponse | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [flowBoards, setFlowBoards] = useState<ExportToFlowBoardOption[]>([]);
  const [flowOffices, setFlowOffices] = useState<ExportToFlowOfficeOption[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    juridicoApi.datajud.listTribunals()
      .then((response) => setTribunals(response.items))
      .catch(() => setError({ color: "danger", message: "Não foi possível carregar o catálogo de tribunais." }))
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    // Flow e opcional: cliente sem o produto contratado simplesmente nao ve a
    // acao de export.
    juridicoApi.domainIntegrations
      .listFlowBoards()
      .then((response) => {
        setFlowBoards(response.flowEnabled ? response.boards : []);
        setFlowOffices(response.flowEnabled ? response.offices : []);
      })
      .catch(() => {
        setFlowBoards([]);
        setFlowOffices([]);
      });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidCnj(number)) {
      setValidation("Informe um número CNJ válido, incluindo os dígitos verificadores.");
      return;
    }
    setValidation("");
    setError(null);
    setLoading(true);
    try {
      const response = await juridicoApi.datajud.queryProcess(number, tribunal || undefined);
      setResult(response);
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (caught) {
      setError(describeJuridicoError(caught, "A consulta está indisponível no momento. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Alert color="info">Fonte: DataJud/CNJ. Os dados podem apresentar defasagem em relação ao tribunal de origem.</Alert>
      <DataJudOabSearchPanel
        boards={flowBoards}
        offices={flowOffices}
        onOpenProcess={(opened) => {
          setResult(opened);
          setError(null);
          setNumber(formatCnj(opened.process.numeroProcesso));
          setTribunal(opened.process.tribunal);
          resultHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <Card>
        <CardBody>
          <form onSubmit={submit} noValidate>
            <Row className="g-3 align-items-end">
              <Col lg={5}>
                <Label htmlFor="cnj-number">Número CNJ</Label>
                <Input id="cnj-number" value={number} invalid={Boolean(validation)} onChange={(event) => setNumber(formatCnj(event.target.value))} placeholder="0000000-00.0000.0.00.0000" inputMode="numeric" autoComplete="off" />
                <FormFeedback>{validation}</FormFeedback>
              </Col>
              <Col lg={4}>
                <Label htmlFor="cnj-tribunal">Tribunal (opcional)</Label>
                <Input id="cnj-tribunal" type="select" value={tribunal} disabled={catalogLoading} onChange={(event) => setTribunal(event.target.value)}>
                  <option value="">{catalogLoading ? "Carregando tribunais..." : "Inferir pelo número CNJ"}</option>
                  {tribunals.map((item) => <option key={item.sigla} value={item.sigla}>{item.sigla} — {item.nome}</option>)}
                </Input>
              </Col>
              <Col lg={3}>
                <Button color="primary" className="w-100" disabled={loading} type="submit">
                  {loading ? <><Spinner size="sm" className="me-2" aria-hidden="true" />Consultando...</> : "Consultar processo"}
                </Button>
              </Col>
            </Row>
            <div className="visually-hidden" aria-live="polite">{loading ? "Consulta em andamento" : ""}</div>
          </form>
        </CardBody>
      </Card>
      {error && <Alert color={error.color} role="alert">{error.message}{error.requestId && <div className="small mt-1">Código de suporte: <code>{error.requestId}</code></div>}</Alert>}
      {result && !loading && (
        <div className="vstack gap-3">
          <h2 ref={resultHeading} tabIndex={-1} className="visually-hidden">Resultado do processo</h2>
          {flowBoards.length > 0 && (
            <div className="d-flex justify-content-end">
              <Button
                color="soft-primary"
                disabled={!result.snapshotId}
                title={result.snapshotId ? undefined : "Consulta nao pode ser persistida; refaca a consulta para exportar."}
                onClick={() => setExportOpen(true)}
              >
                <i className="ri-share-forward-line me-1" />
                Exportar para o Flow
              </Button>
            </div>
          )}
          <DataJudProcessSummary result={result} />
          <DataJudMovementList movements={result.process.movimentacoes} />
        </div>
      )}
      <ExportToFlowModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        subject={result ? { label: "Processo", value: formatCnj(result.process.numeroProcesso) } : null}
        boards={flowBoards}
        offices={flowOffices}
        onExport={(boardId, officeId) => juridicoApi.domainIntegrations.exportDataJudProcessToFlow(result!.snapshotId!, boardId, officeId)}
      />
    </>
  );
}
