"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, CardHeader, Col, Input, Label, Row, Spinner, Table } from "reactstrap";
import {
  BoardDto,
  KanbanApiError,
  kanbanApi,
  LeadQueueFilters,
  LeadQueueItemDto,
  LeadStatus,
  OfficeListItemDto,
  PageMeta,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { formatLeadDate, LEAD_QUEUE_STATUSES, LEAD_STATUS_META } from "@/modules/kanban/lib/leads";
import LeadStatusBadge from "@/modules/kanban/components/LeadStatusBadge";

const PAGE_SIZE = 20;

/** Filtro inicial da fila: os leads que aguardam o gestor. */
export const DEFAULT_LEAD_QUEUE_FILTERS: LeadQueueFilters = { status: "enviado", limit: PAGE_SIZE, offset: 0 };

interface LeadQueuePanelProps {
  boards: BoardDto[];
  offices: OfficeListItemDto[];
  onForbidden: () => void;
}

/**
 * Fila do gestor (Sprint 4): leads enviados por todos os escritorios, com filtro
 * por escritorio, quadro, estado e data de envio, paginada no backend. "Abrir"
 * leva ao card no quadro (deep-link `?card=`), onde o gestor devolve o lead.
 */
export default function LeadQueuePanel({ boards, offices, onForbidden }: LeadQueuePanelProps) {
  const [filters, setFilters] = useState<LeadQueueFilters>(DEFAULT_LEAD_QUEUE_FILTERS);
  const [rows, setRows] = useState<LeadQueueItemDto[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ limit: PAGE_SIZE, offset: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await kanbanApi.leads.queue(filters);
      setRows(page.data);
      setMeta(page.meta);
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) {
        onForbidden();
        return;
      }
      setError(describeKanbanError(err, "Erro ao carregar a fila de leads"));
    } finally {
      setLoading(false);
    }
  }, [filters, onForbidden]);

  useEffect(() => {
    void load();
  }, [load]);

  function update(patch: Partial<LeadQueueFilters>) {
    setFilters((current) => ({ ...current, ...patch, offset: 0 }));
  }

  const lastItem = Math.min(meta.offset + meta.limit, meta.total);

  return (
    <Card>
      <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h5 className="mb-0">Fila do gestor</h5>
        <Button color="light" size="sm" onClick={() => void load()} disabled={loading}>
          <i className="ri-refresh-line me-1" />
          Atualizar
        </Button>
      </CardHeader>
      <CardBody>
        <Row className="g-2 mb-3">
          <Col md={3}>
            <Label for="lead-filter-status" className="small text-muted mb-1">
              Estado
            </Label>
            <Input
              id="lead-filter-status"
              type="select"
              bsSize="sm"
              value={filters.status ?? ""}
              onChange={(event) => update({ status: (event.target.value || undefined) as LeadStatus | undefined })}
            >
              <option value="">Todos</option>
              {LEAD_QUEUE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_META[status].label}
                </option>
              ))}
            </Input>
          </Col>
          <Col md={3}>
            <Label for="lead-filter-office" className="small text-muted mb-1">
              Escritório
            </Label>
            <Input
              id="lead-filter-office"
              type="select"
              bsSize="sm"
              value={filters.officeId ?? ""}
              onChange={(event) => update({ officeId: event.target.value || undefined })}
            >
              <option value="">Todos</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                  {office.active ? "" : " (inativo)"}
                </option>
              ))}
            </Input>
          </Col>
          <Col md={2}>
            <Label for="lead-filter-board" className="small text-muted mb-1">
              Quadro
            </Label>
            <Input
              id="lead-filter-board"
              type="select"
              bsSize="sm"
              value={filters.boardId ?? ""}
              onChange={(event) => update({ boardId: event.target.value || undefined })}
            >
              <option value="">Todos</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </Input>
          </Col>
          <Col md={2}>
            <Label for="lead-filter-from" className="small text-muted mb-1">
              Enviado de
            </Label>
            <Input
              id="lead-filter-from"
              type="date"
              bsSize="sm"
              value={filters.submittedFrom ?? ""}
              onChange={(event) => update({ submittedFrom: event.target.value || undefined })}
            />
          </Col>
          <Col md={2}>
            <Label for="lead-filter-to" className="small text-muted mb-1">
              Até
            </Label>
            <Input
              id="lead-filter-to"
              type="date"
              bsSize="sm"
              value={filters.submittedTo ?? ""}
              onChange={(event) => update({ submittedTo: event.target.value || undefined })}
            />
          </Col>
        </Row>

        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted text-center py-4 mb-0">Nenhum lead encontrado com estes filtros.</p>
        ) : (
          <>
            <div className="table-responsive">
              <Table className="table-nowrap align-middle mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Lead</th>
                    <th>Escritório</th>
                    <th>Quadro</th>
                    <th>Estado</th>
                    <th>Enviado em</th>
                    <th>Enviado por</th>
                    <th className="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.cardId}>
                      <td className="text-wrap">{row.cardTitle}</td>
                      <td>{row.officeName ?? <span className="badge bg-warning-subtle text-warning">Sem escritório</span>}</td>
                      <td>{row.boardName}</td>
                      <td>
                        <LeadStatusBadge status={row.status} showDraft />
                        {row.status === "devolvido" && row.returnReason && (
                          <div className="small text-muted text-wrap mt-1" title="Motivo da devolução">
                            {row.returnReason}
                          </div>
                        )}
                      </td>
                      <td>{formatLeadDate(row.submittedAt)}</td>
                      <td>{row.submittedByName ?? "-"}</td>
                      <td className="text-end">
                        <Link href={`/flow/boards/${row.boardId}?card=${row.cardId}`} className="btn btn-sm btn-primary">
                          <i className="ri-external-link-line me-1" />
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="d-flex align-items-center justify-content-between mt-3">
              <span className="small text-muted">
                {meta.offset + 1}–{lastItem} de {meta.total}
              </span>
              <div className="d-flex gap-2">
                <Button
                  size="sm"
                  color="light"
                  disabled={meta.offset === 0}
                  onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}
                >
                  <i className="ri-arrow-left-s-line" /> Anterior
                </Button>
                <Button
                  size="sm"
                  color="light"
                  disabled={lastItem >= meta.total}
                  onClick={() => setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))}
                >
                  Próxima <i className="ri-arrow-right-s-line" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
