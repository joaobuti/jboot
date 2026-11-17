"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, ButtonGroup, Card, CardBody, CardHeader, Spinner, Table } from "reactstrap";
import { EmailDispatchFilter, EmailDispatchListDto, KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { DISPATCH_STATUS, TRIGGER_LABEL, attemptLabel, canRetry, errorLabel, oldestPendingMinutes } from "./email-dispatches";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const FILTERS: Array<{ value: EmailDispatchFilter; label: string; icon: string }> = [
  { value: "failed", label: "Falhas", icon: "ri-error-warning-line" },
  { value: "pending", label: "Na fila", icon: "ri-time-line" },
];

/**
 * Envios das automacoes de e-mail (Sprint 13): mesmo painel operacional da replica do
 * Google Drive (contadores + falhas + Reprocessar). Falha terminal so volta pela acao humana.
 */
export default function EmailDispatchesSettingsPage() {
  const [filter, setFilter] = useState<EmailDispatchFilter>("failed");
  const [data, setData] = useState<EmailDispatchListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async (current: EmailDispatchFilter) => {
    setForbidden(false);
    try {
      setData(await kanbanApi.emailDispatches.list(current));
    } catch (cause) {
      if (cause instanceof KanbanApiError && cause.status === 403) setForbidden(true);
      else setError(describeKanbanError(cause, "Erro ao carregar os envios de e-mail"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  async function retry(dispatchId: string) {
    setBusy(dispatchId);
    setError(null);
    setSuccess(null);
    try {
      await kanbanApi.emailDispatches.retry(dispatchId);
      await load(filter);
      setSuccess("Envio devolvido à fila. Ele sai em instantes.");
    } catch (cause) {
      const message = describeKanbanError(cause, "Erro ao reprocessar o envio");
      await load(filter);
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-center py-5"><Spinner color="primary" /></div>;
  if (forbidden) return <Alert color="warning"><i className="ri-lock-line me-2" />Você não possui permissão para acompanhar os envios das automações.</Alert>;

  const summary = data?.summary;
  const oldest = oldestPendingMinutes(summary?.oldestPendingAt ?? null);
  const items = data?.items ?? [];

  return (
    <>
      <div className="mb-3">
        <h4 className="mb-1">Envios de e-mail</h4>
        <p className="text-muted mb-0">Acompanhe os e-mails das automações de coluna e reenvie os que falharam.</p>
      </div>

      <Alert color="info">
        <i className="ri-information-line me-2" />
        Cada envio é tentado até {data?.maxAttempts ?? 5} vezes, com espera crescente. Depois disso ele fica aqui como falha até ser reprocessado.
      </Alert>
      {error && <Alert color="danger" toggle={() => setError(null)}>{error} <Button color="link" className="p-0 ms-1" onClick={() => void load(filter)}>Tentar novamente</Button></Alert>}
      {success && <Alert color="success" toggle={() => setSuccess(null)}>{success}</Alert>}

      <Card>
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex flex-wrap gap-2">
            <Badge color="warning">Na fila {summary?.pending ?? 0}</Badge>
            <Badge color="info">Enviando {summary?.processing ?? 0}</Badge>
            <Badge color="danger">Falhas {summary?.failed ?? 0}</Badge>
          </div>
          <ButtonGroup size="sm">
            {FILTERS.map((option) => (
              <Button key={option.value} color="primary" outline={filter !== option.value} onClick={() => setFilter(option.value)} disabled={busy !== null}>
                <i className={`${option.icon} me-1`} />{option.label}
              </Button>
            ))}
          </ButtonGroup>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            Espera do envio mais antigo na fila: {oldest === null ? "sem fila" : `${oldest} min`}.
          </p>
          {items.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">
              {filter === "failed" ? "Nenhuma falha para reprocessar." : "Nenhum envio aguardando."}
            </p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap align-middle mb-0" hover>
                <thead className="table-light">
                  <tr><th>Card</th><th>Gatilho</th><th>Situação</th><th>Tentativas</th><th>Último erro</th><th>Atualização</th><th className="text-end">Ações</th></tr>
                </thead>
                <tbody>{items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="fw-medium text-truncate" style={{ maxWidth: 260 }}>{item.cardTitle}</div>
                      <div className="text-muted small">{item.boardName} · {item.columnName}</div>
                    </td>
                    <td>{TRIGGER_LABEL[item.triggerType] ?? item.triggerType}</td>
                    <td><Badge color={DISPATCH_STATUS[item.status].color}>{DISPATCH_STATUS[item.status].label}</Badge></td>
                    <td>{attemptLabel(item, data?.maxAttempts ?? 5)}</td>
                    <td className="text-wrap small" style={{ maxWidth: 280 }}>{errorLabel(item.lastError)}</td>
                    <td>{formatDate(item.updatedAt)}</td>
                    <td className="text-end">
                      {canRetry(item) && (
                        <Button size="sm" color="primary" outline onClick={() => void retry(item.id)} disabled={busy !== null}>
                          {busy === item.id ? <Spinner size="sm" /> : <><i className="ri-restart-line me-1" />Reprocessar</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
