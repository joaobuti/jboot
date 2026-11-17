"use client";

import { FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, Col, Input, Label, Progress, Row, Spinner, Table, UncontrolledTooltip } from "reactstrap";
import ExportToFlowModal, { ExportToFlowBoardOption, ExportToFlowOfficeOption } from "@/components/Common/ExportToFlowModal";
import { DataJudProcessByOab, DataJudProcessQueryResponse, JuridicoApiError, juridicoApi } from "../lib/juridico-api";
import { describeJuridicoError } from "../lib/juridico-errors";
import { UF_LIST } from "../lib/ufs";

interface DataJudOabSearchPanelProps {
  boards: ExportToFlowBoardOption[];
  offices: ExportToFlowOfficeOption[];
  /** Abre o processo detalhado na area de resultado, com capa e movimentacoes. */
  onOpenProcess: (result: DataJudProcessQueryResponse) => void;
}

type RowState = "idle" | "loading" | "ready" | "stored" | "missing" | "error";

interface RowStatus {
  state: RowState;
  snapshotId?: string | null;
  /** Resposta completa, para exibir sem reconsultar o provedor. */
  response?: DataJudProcessQueryResponse;
}

function defaultPeriod(): { inicio: string; fim: string } {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setMonth(inicio.getMonth() - 3);
  return { inicio: inicio.toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) };
}

/**
 * Busca de processos pela OAB do advogado.
 *
 * A listagem responde em milissegundos porque não detalha nada: o
 * detalhamento de cada processo é feito sob demanda, ao selecionar. Consultar
 * todos de uma vez levou 87s em medição real (25 processos), o que tornaria a
 * tela inutilizável — ver `docs/product/juridico-datajud-flow-sprints.md`,
 * Sprint 8.
 */
export default function DataJudOabSearchPanel({ boards, offices, onOpenProcess }: DataJudOabSearchPanelProps) {
  const periodo = defaultPeriod();
  const [numeroOab, setNumeroOab] = useState("");
  const [ufOab, setUfOab] = useState("");
  const [dataInicio, setDataInicio] = useState(periodo.inicio);
  const [dataFim, setDataFim] = useState(periodo.fim);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DataJudProcessByOab[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);
  const [exportSkipped, setExportSkipped] = useState(0);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  const selectedItems = (items ?? []).filter((item) => selected.has(item.numeroProcesso));

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setItems(null);
    setSelected(new Set());
    setStatus({});
    try {
      const result = await juridicoApi.datajud.listProcessesByOab(numeroOab, ufOab, dataInicio, dataFim);
      setItems(result.items);
      // Consulta anterior gravada: a linha ja nasce com "Ver dados" disponivel,
      // sem exigir novo detalhamento apos um reload.
      setStatus(
        Object.fromEntries(
          result.items
            .filter((item) => item.snapshotId)
            .map((item) => [item.numeroProcesso, { state: "stored" as RowState, snapshotId: item.snapshotId }]),
        ),
      );
      if (result.items.length === 0) {
        setError("Nenhum processo encontrado para esta OAB no período informado.");
      }
    } catch (err) {
      setError(describeJuridicoError(err, "Não foi possível buscar os processos.").message);
    } finally {
      setLoading(false);
    }
  }

  function toggle(numero: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(numero)) next.delete(numero);
      else next.add(numero);
      return next;
    });
  }

  /**
   * Detalha os processos escolhidos, um a um. Sequencial de propósito: o
   * serviço impõe intervalo mínimo entre chamadas ao provedor, então disparar
   * em paralelo só enfileiraria com menos previsibilidade e sem barra de
   * progresso honesta.
   */
  async function detailOne(item: DataJudProcessByOab): Promise<RowStatus> {
    setStatus((current) => ({ ...current, [item.numeroProcesso]: { state: "loading" } }));
    try {
      const result = await juridicoApi.datajud.queryProcess(item.numeroProcesso, item.tribunal ?? undefined);
      const next: RowStatus = { state: "ready", snapshotId: result.snapshotId, response: result };
      setStatus((current) => ({ ...current, [item.numeroProcesso]: next }));
      return next;
    } catch (err) {
      // Processo sem registro na base e resultado normal, nao falha da tela.
      // Classificar pelo `code`, nao pela mensagem: o texto e legivel para o
      // usuario e muda, entao casar por regex quebra em silencio e transforma
      // "sem registro" em "falhou".
      const apiError = err instanceof JuridicoApiError ? err : null;
      const missing = apiError?.code === "process_not_found" || apiError?.status === 404;
      const next: RowStatus = { state: missing ? "missing" : "error" };
      setStatus((current) => ({ ...current, [item.numeroProcesso]: next }));
      return next;
    }
  }

  /**
   * Abre os dados sem novo custo de provedor: usa a resposta desta sessao se
   * existir, senao le o snapshot gravado. So consulta o CNJ quando nao ha nem
   * um nem outro.
   */
  async function openProcess(item: DataJudProcessByOab) {
    const row = status[item.numeroProcesso];
    if (row?.response) {
      onOpenProcess(row.response);
      return;
    }
    if (row?.snapshotId) {
      try {
        const stored = await juridicoApi.datajud.getStoredProcess(row.snapshotId);
        setStatus((current) => ({
          ...current,
          [item.numeroProcesso]: { ...current[item.numeroProcesso], response: stored },
        }));
        onOpenProcess(stored);
        return;
      } catch {
        // Snapshot expirado ou purgado: cai para consulta nova.
      }
    }
    const fresh = await detailOne(item);
    if (fresh.response) onOpenProcess(fresh.response);
  }

  async function detailSelected() {
    setProgress({ done: 0, total: selectedItems.length });
    for (const [index, item] of selectedItems.entries()) {
      await detailOne(item);
      setProgress({ done: index + 1, total: selectedItems.length });
    }
    setProgress(null);
  }

  /**
   * Exporta a selecao, detalhando sob demanda o que ainda nao foi detalhado.
   *
   * O usuario nao precisa conferir os dados antes de jogar para o Flow — mas o
   * export exige o snapshot da consulta, entao quem nao tem e detalhado aqui,
   * na hora. Dai o export de um lote nao conferido levar alguns segundos por
   * processo.
   */
  async function exportSelected(boardId: string, officeId: string) {
    let created = 0;
    let semRegistro = 0;
    let last = { cardUrl: "", created: false };

    for (const [index, item] of selectedItems.entries()) {
      setExportProgress(`Preparando ${index + 1} de ${selectedItems.length}: ${item.numeroProcessoMask}`);
      // Snapshot ja gravado (inclusive de consulta anterior) dispensa nova
      // ida ao provedor: o que o export precisa e do id, nao do estado da tela.
      let row = status[item.numeroProcesso];
      if (!row?.snapshotId) {
        row = await detailOne(item);
      }
      if (!row.snapshotId) {
        semRegistro += 1;
        continue;
      }
      const result = await juridicoApi.domainIntegrations.exportDataJudProcessToFlow(row.snapshotId, boardId, officeId);
      if (result.created) created += 1;
      last = { cardUrl: result.cardUrl, created: result.created };
    }

    setExportProgress(null);
    setExportedCount(created);
    setExportSkipped(semRegistro);
    if (created === 0 && semRegistro === selectedItems.length) {
      throw new Error("Nenhum dos processos selecionados tem registro na base consultada.");
    }
    return last;
  }

  const badge: Record<RowState, { color: string; label: string }> = {
    idle: { color: "light", label: "—" },
    loading: { color: "info", label: "Consultando" },
    ready: { color: "success", label: "Detalhado" },
    stored: { color: "info", label: "Consulta salva" },
    missing: { color: "warning", label: "Sem registro" },
    error: { color: "danger", label: "Falhou" },
  };

  return (
    <Card className="mb-3">
      <CardBody>
        <h5 className="card-title">Buscar meus processos pela OAB</h5>
        <form onSubmit={search}>
          <Row className="g-3 align-items-end">
            <Col lg={2}>
              <Label htmlFor="oab-numero">Número da OAB</Label>
              <Input id="oab-numero" value={numeroOab} onChange={(e) => setNumeroOab(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </Col>
            <Col lg={2}>
              <Label htmlFor="oab-uf">Estado (UF)</Label>
              <Input id="oab-uf" type="select" value={ufOab} onChange={(e) => setUfOab(e.target.value)}>
                <option value="">Selecione</option>
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </Input>
            </Col>
            <Col lg={2}>
              <Label htmlFor="oab-inicio">De</Label>
              <Input id="oab-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </Col>
            <Col lg={2}>
              <Label htmlFor="oab-fim">Até</Label>
              <Input id="oab-fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </Col>
            <Col lg={3}>
              <Button color="primary" className="w-100" type="submit" disabled={loading || !numeroOab || ufOab.length !== 2}>
                {loading ? <><Spinner size="sm" className="me-2" />Buscando...</> : "Buscar processos"}
              </Button>
            </Col>
          </Row>
        </form>

        {error && <Alert color="warning" className="mt-3 mb-0">{error}</Alert>}

        {items && items.length > 0 && (
          <div className="mt-3">
            <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
              <span className="text-muted small">
                {items.length} processos encontrados
                {items.some((item) => item.exportado) && (
                  <>
                    {" · "}
                    <i className="ri-checkbox-circle-fill text-success" /> já no Flow:{" "}
                    {items.filter((item) => item.exportado).length}
                  </>
                )}
              </span>
              <Button size="sm" color="light" disabled={selected.size === 0 || progress !== null} onClick={() => void detailSelected()}>
                Detalhar selecionados ({selected.size})
              </Button>
              {boards.length > 0 && (
                <Button
                  size="sm"
                  color="soft-primary"
                  disabled={selected.size === 0 || progress !== null}
                  onClick={() => { setExportedCount(0); setExportSkipped(0); setExportOpen(true); }}
                >
                  <i className="ri-share-forward-line me-1" />
                  Exportar selecionados ({selected.size})
                </Button>
              )}
            </div>

            {progress && (
              <div className="mb-2">
                <Progress value={(progress.done / progress.total) * 100} />
                <div className="text-muted small mt-1">
                  Consultando {progress.done} de {progress.total}. Cada processo leva alguns segundos.
                </div>
              </div>
            )}

            <div className="table-responsive">
              <Table className="align-middle mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Processo</th>
                    <th>Tribunal</th>
                    <th>Classe</th>
                    <th>Última movimentação</th>
                    <th>Situação</th>
                    <th className="text-end">Dados</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const rowStatus = status[item.numeroProcesso]?.state ?? "idle";
                    return (
                      <tr key={item.numeroProcesso}>
                        <td>
                          <Input
                            type="checkbox"
                            checked={selected.has(item.numeroProcesso)}
                            disabled={progress !== null}
                            onChange={() => toggle(item.numeroProcesso)}
                            aria-label={`Selecionar ${item.numeroProcessoMask}`}
                          />
                        </td>
                        <td className="text-nowrap">
                          {item.numeroProcessoMask}
                          {item.exportado && (
                            <>
                              <a
                                id={`exportado-${item.numeroProcesso}`}
                                href={item.cardUrl ?? "#"}
                                className="ms-2 text-success"
                                aria-label="Já exportado para o Flow"
                              >
                                <i className="ri-checkbox-circle-fill" />
                              </a>
                              <UncontrolledTooltip target={`exportado-${item.numeroProcesso}`}>
                                Já exportado para o Flow — abrir card
                              </UncontrolledTooltip>
                            </>
                          )}
                        </td>
                        <td><Badge className="bg-primary-subtle text-primary">{item.tribunal ?? "—"}</Badge></td>
                        <td>{item.classe ?? "—"}</td>
                        <td className="text-nowrap">
                          {item.ultimaPublicacaoEm ? new Date(`${item.ultimaPublicacaoEm}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td>
                          {rowStatus === "loading"
                            ? <Spinner size="sm" />
                            : <Badge color={badge[rowStatus].color}>{badge[rowStatus].label}</Badge>}
                        </td>
                        <td className="text-end">
                          {(rowStatus === "ready" || rowStatus === "stored") && (
                            <Button
                              size="sm"
                              color="light"
                              onClick={() => void openProcess(item)}
                            >
                              Ver dados
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            {Object.values(status).some((value) => value.state === "missing") && (
              <p className="text-muted small mt-2 mb-0">
                Processos marcados como &quot;sem registro&quot; ainda não constam na base consultada. Isso
                não indica erro: a base pode ter defasagem em relação ao tribunal.
              </p>
            )}
            {(exportedCount > 0 || exportSkipped > 0) && (
              <Alert color={exportedCount > 0 ? "success" : "warning"} className="mt-3 mb-0">
                {exportedCount} card(s) criado(s) no Flow.
                {exportSkipped > 0 && ` ${exportSkipped} processo(s) sem registro na base não foram exportados.`}
              </Alert>
            )}
          </div>
        )}
      </CardBody>

      <ExportToFlowModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        subject={{ label: "Processos selecionados", value: `${selected.size} processo(s)` }}
        boards={boards}
        offices={offices}
        onExport={exportSelected}
        progressLabel={exportProgress}
      />
    </Card>
  );
}
