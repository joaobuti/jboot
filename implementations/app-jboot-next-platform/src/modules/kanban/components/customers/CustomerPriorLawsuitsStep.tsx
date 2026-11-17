"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Col, Input, Label, Row, Spinner, Table } from "reactstrap";
import { getApplicationScopes } from "@/lib/module-auth-token";
import { kanbanApi, PriorLawsuitHistoryItemDto, PriorLawsuitsDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";

/** Quem grava na ficha: as mesmas permissões das rotas de escrita do cliente. */
export const PRIOR_LAWSUITS_WRITE_SCOPES = ["flow:customers:write", "flow:admin"];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/** Situação da litispendência mostrada no topo do passo (ADR 020, decisão 7). */
export function priorLawsuitsAlert(data: PriorLawsuitsDto): { color: string; text: string } {
  if (data.status === "listed") {
    const count = data.lawsuits.length;
    return {
      color: "info",
      text: `${count} ${count === 1 ? "ação já ajuizada" : "ações já ajuizadas"}. A lista serve à rotina de petições iniciais para não repetir banco ou contrato já discutido (litispendência).`,
    };
  }
  if (data.status === "declared_none" && data.declaration?.origin === "default") {
    return {
      color: "success",
      text: "Sem ações anteriores (marcado por padrão no cadastro). Se o cliente já tiver ações, inclua-as abaixo ou desmarque.",
    };
  }
  if (data.status === "declared_none") {
    const by = data.declaration?.declaredByName ? ` por ${data.declaration.declaredByName}` : "";
    const at = data.declaration ? ` em ${formatDateTime(data.declaration.declaredAt)}` : "";
    return { color: "success", text: `Confirmado que o cliente não tem ações anteriores${by}${at}.` };
  }
  return {
    color: "warning",
    text: "Sem lista e sem confirmação. A automação de Petições iniciais não roda para este cliente até que as ações já ajuizadas sejam registradas ou a ausência delas seja confirmada.",
  };
}

export function priorLawsuitHistoryLabel(item: PriorLawsuitHistoryItemDto): string {
  const lawsuit = item.bank ? `${item.bank}, processo ${item.processNumber}` : "";
  switch (item.kind) {
    case "lawsuit_added":
      return `Incluiu ${lawsuit}`;
    case "lawsuit_removed":
      return `Removeu ${lawsuit}`;
    case "declared_none":
      return item.origin === "default"
        ? "Cliente cadastrado com \"sem ações anteriores\" marcado por padrão"
        : "Confirmou que o cliente não tem ações anteriores";
    case "declaration_revoked":
      return item.reason === "lawsuit_added"
        ? "Confirmação \"sem ações anteriores\" desfeita pela inclusão de uma ação"
        : "Desfez a confirmação \"sem ações anteriores\"";
  }
}

/**
 * Passo "Ações ajuizadas" da ficha (S2 de docs/product/flow-initial-petitions-sprints.md): ações já
 * ajuizadas pelo cliente (banco e número CNJ) ou a confirmação explícita de que não há nenhuma. Grava
 * na hora, como os passos Documentos e Validação.
 */
export default function CustomerPriorLawsuitsStep({ customerId }: { customerId: string | null }) {
  const [canWrite] = useState(() => getApplicationScopes("app:flow").some((scope) => PRIOR_LAWSUITS_WRITE_SCOPES.includes(scope)));
  const [data, setData] = useState<PriorLawsuitsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bank, setBank] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [toRemove, setToRemove] = useState<PriorLawsuitsDto["lawsuits"][number] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await kanbanApi.priorLawsuits.get(customerId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar as ações ajuizadas"));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<PriorLawsuitsDto>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      setData(await action());
      return true;
    } catch (err) {
      setError(describeKanbanError(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // O passo vive dentro do formulario do cliente: sem <form> proprio (aninhado enviaria o do cliente).
  async function add() {
    if (!customerId) return;
    if (!bank.trim() || !processNumber.trim()) {
      setError("Informe o banco e o número do processo.");
      return;
    }
    const ok = await run(() => kanbanApi.priorLawsuits.add(customerId, { bank, processNumber }), "Erro ao incluir a ação");
    if (ok) {
      setBank("");
      setProcessNumber("");
    }
  }

  // Enter nos campos inclui a acao em vez de salvar o cliente.
  function addOnEnter(event: React.KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void add();
  }

  if (!customerId) {
    return <Alert color="info" className="mb-0">Salve o cliente para registrar as ações já ajuizadas.</Alert>;
  }
  if (loading && !data) {
    return <div className="text-center py-4"><Spinner color="primary" /></div>;
  }

  const alert = data ? priorLawsuitsAlert(data) : null;
  return (
    <>
      <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">
        <i className="ri-scales-3-line me-1" />
        Ações já ajuizadas
      </p>
      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      {alert && <Alert color={alert.color}>{alert.text}</Alert>}

      {data && data.lawsuits.length > 0 && (
        <div className="table-responsive mb-3">
          <Table className="table-nowrap mb-0" size="sm">
            <thead className="table-light">
              <tr><th>Banco</th><th>Processo</th><th>Registrado por</th>{canWrite && <th className="text-end">Ação</th>}</tr>
            </thead>
            <tbody>
              {data.lawsuits.map((lawsuit) => (
                <tr key={lawsuit.id}>
                  <td>{lawsuit.bank}</td>
                  <td className="font-monospace">{lawsuit.processNumber}</td>
                  <td className="text-muted small">{lawsuit.createdByName ?? "-"} em {formatDateTime(lawsuit.createdAt)}</td>
                  {canWrite && (
                    <td className="text-end">
                      <Button type="button" size="sm" color="danger" outline disabled={busy} onClick={() => setToRemove(lawsuit)}>Remover</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {canWrite && (
        <div>
          <Row className="g-2 align-items-end">
            <Col md={5}>
              <Label for="prior-lawsuit-bank" className="form-label">Banco</Label>
              <Input id="prior-lawsuit-bank" value={bank} maxLength={200} disabled={busy} onKeyDown={addOnEnter} onChange={(event) => setBank(event.target.value)} />
            </Col>
            <Col md={5}>
              <Label for="prior-lawsuit-number" className="form-label">Número do processo (CNJ)</Label>
              <Input
                id="prior-lawsuit-number"
                value={processNumber}
                maxLength={40}
                placeholder="0000000-00.0000.0.00.0000"
                disabled={busy}
                onKeyDown={addOnEnter}
                onChange={(event) => setProcessNumber(event.target.value)}
              />
            </Col>
            <Col md={2}>
              <Button color="primary" type="button" className="w-100" disabled={busy} onClick={() => void add()}>
                {busy ? <Spinner size="sm" /> : <><i className="ri-add-line me-1" />Incluir</>}
              </Button>
            </Col>
          </Row>
        </div>
      )}

      {canWrite && data?.status === "missing" && (
        <div className="mt-3">
          <Button type="button" color="success" outline size="sm" disabled={busy} onClick={() => void run(() => kanbanApi.priorLawsuits.declareNone(customerId), "Erro ao confirmar")}>
            <i className="ri-checkbox-circle-line me-1" />
            Cliente não tem ações anteriores
          </Button>
          <div className="form-text">Use só depois de conferir com o cliente. Incluir uma ação depois desfaz a confirmação.</div>
        </div>
      )}
      {canWrite && data?.status === "declared_none" && (
        <div className="mt-3">
          <Button type="button" color="secondary" outline size="sm" disabled={busy} onClick={() => void run(() => kanbanApi.priorLawsuits.withdrawDeclaration(customerId), "Erro ao desfazer")}>
            {data.declaration?.origin === "default" ? "Desmarcar \"sem ações anteriores\"" : "Desfazer confirmação"}
          </Button>
          <div className="form-text">Desmarcado e sem ações na lista, a automação de Petições iniciais não roda para este cliente.</div>
        </div>
      )}

      {data && data.history.length > 0 && (
        <div className="mt-4">
          <Button type="button" color="link" size="sm" className="p-0" onClick={() => setShowHistory((value) => !value)}>
            <i className={`${showHistory ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"} me-1`} />
            Histórico ({data.history.length})
          </Button>
          {showHistory && (
            <ul className="list-unstyled small mt-2 mb-0">
              {data.history.map((item, index) => (
                <li key={`${item.kind}-${item.at}-${index}`} className="mb-1">
                  <span className="text-muted">{formatDateTime(item.at)} · {item.byName ?? "-"}:</span> {priorLawsuitHistoryLabel(item)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmActionModal
        isOpen={toRemove !== null}
        title="Remover ação da lista?"
        confirmLabel="Remover"
        color="danger"
        icon="ri-delete-bin-line"
        busy={busy}
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          const target = toRemove;
          if (!target) return;
          void run(() => kanbanApi.priorLawsuits.remove(customerId, target.id), "Erro ao remover a ação").then(() => setToRemove(null));
        }}
      >
        {toRemove && <>A ação contra {toRemove.bank} (processo {toRemove.processNumber}) sai da lista e fica no histórico.</>}
      </ConfirmActionModal>
    </>
  );
}
