"use client";

import React, { useEffect, useRef, useState } from "react";
import { Alert, Card, CardBody, CardHeader, Col, Input, Label, Progress, Row, Spinner, Table } from "reactstrap";
import {
  BoardDto,
  MetricsByAssigneeDto,
  MetricsByStatusDto,
  MetricsDto,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";

interface Filters {
  boardId: string;
  assigneeId: string;
  statusId: string;
}

const EMPTY_FILTERS: Filters = { boardId: "", assigneeId: "", statusId: "" };

function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return "0min";
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

export default function MetricsHomePanel() {
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [metrics, setMetrics] = useState<MetricsDto | null>(null);
  const [statusOptions, setStatusOptions] = useState<MetricsByStatusDto[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<MetricsByAssigneeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optionsCaptured = useRef(false);

  useEffect(() => {
    void kanbanApi.boards
      .list()
      .then((page) => setBoards(page.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    kanbanApi.metrics
      .get({
        boardId: filters.boardId || undefined,
        assigneeId: filters.assigneeId || undefined,
        statusId: filters.statusId || undefined,
      })
      .then((result) => {
        if (!active) {
          return;
        }
        setMetrics(result);
        if (!optionsCaptured.current) {
          setStatusOptions(result.byStatus);
          setAssigneeOptions(result.byAssignee);
          optionsCaptured.current = true;
        }
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : "Erro ao carregar métricas");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [filters.boardId, filters.assigneeId, filters.statusId]);

  return (
    <div>
      <Card className="mb-3">
        <CardBody>
          <Row className="g-3">
            <Col md={4}>
              <Label className="form-label">Board</Label>
              <Input
                bsSize="sm"
                type="select"
                value={filters.boardId}
                onChange={(event) => setFilters((prev) => ({ ...prev, boardId: event.target.value }))}
              >
                <option value="">Todos os boards</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </Input>
            </Col>
            <Col md={4}>
              <Label className="form-label">Responsável</Label>
              <Input
                bsSize="sm"
                type="select"
                value={filters.assigneeId}
                onChange={(event) => setFilters((prev) => ({ ...prev, assigneeId: event.target.value }))}
              >
                <option value="">Todos os responsáveis</option>
                {assigneeOptions.map((assignee) => (
                  <option key={assignee.identityId} value={assignee.identityId}>
                    {assignee.displayName ?? "Sem nome"}
                  </option>
                ))}
              </Input>
            </Col>
            <Col md={4}>
              <Label className="form-label">Status</Label>
              <Input
                bsSize="sm"
                type="select"
                value={filters.statusId}
                onChange={(event) => setFilters((prev) => ({ ...prev, statusId: event.target.value }))}
              >
                <option value="">Todos os status</option>
                {statusOptions
                  .filter((status) => status.statusId !== null)
                  .map((status) => (
                    <option key={status.statusId} value={status.statusId ?? ""}>
                      {status.statusName}
                    </option>
                  ))}
              </Input>
            </Col>
          </Row>
        </CardBody>
      </Card>

      {error && (
        <Alert color="danger">
          <i className="ri-error-warning-line me-2" />
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="text-center py-5">
          <Spinner />
        </div>
      ) : metrics ? (
        metrics.totalCards === 0 ? (
          <Alert color="secondary" className="text-center">
            Nenhum card encontrado com os filtros selecionados.
          </Alert>
        ) : (
          <Row className="g-3">
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody>
                  <p className="text-muted mb-1">Total de cards</p>
                  <h3 className="mb-0">{metrics.totalCards}</h3>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody>
                  <p className="text-muted mb-1">Sem responsável</p>
                  <h3 className="mb-0">{metrics.unassignedCount}</h3>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody>
                  <p className="text-muted mb-1">Criados (30 dias)</p>
                  <h3 className="mb-0">{metrics.throughput.createdLast30Days}</h3>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody>
                  <p className="text-muted mb-1">Concluídos (30 dias)</p>
                  <h3 className="mb-0">{metrics.throughput.archivedLast30Days}</h3>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody>
                  <p className="text-muted mb-1">Atrasados</p>
                  <h3 className="mb-0 text-danger">{metrics.overdueCount}</h3>
                </CardBody>
              </Card>
            </Col>

            <Col md={6}>
              <Card className="mb-0 h-100">
                <CardHeader>Cards por status</CardHeader>
                <CardBody>
                  {metrics.byStatus.map((status) => (
                    <div key={status.statusId ?? "none"} className="mb-2">
                      <div className="d-flex justify-content-between small mb-1">
                        <span>{status.statusName}</span>
                        <span>{status.count}</span>
                      </div>
                      <Progress
                        value={metrics.totalCards > 0 ? (status.count / metrics.totalCards) * 100 : 0}
                        color="primary"
                      />
                    </div>
                  ))}
                </CardBody>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="mb-0 h-100">
                <CardHeader>Cards por responsável</CardHeader>
                <CardBody>
                  {metrics.byAssignee.length === 0 ? (
                    <p className="text-muted mb-0">Nenhum responsável atribuído.</p>
                  ) : (
                    metrics.byAssignee.map((assignee) => (
                      <div key={assignee.identityId} className="mb-2">
                        <div className="d-flex justify-content-between small mb-1">
                          <span>{assignee.displayName ?? "Sem nome"}</span>
                          <span>{assignee.count}</span>
                        </div>
                        <Progress
                          value={metrics.totalCards > 0 ? (assignee.count / metrics.totalCards) * 100 : 0}
                          color="info"
                        />
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>
            </Col>

            <Col md={12}>
              <Card className="mb-0">
                <CardHeader>Cards por coluna</CardHeader>
                <CardBody>
                  {!filters.boardId ? (
                    <Alert color="secondary" className="mb-0">
                      Selecione um board para ver cards por coluna.
                    </Alert>
                  ) : (
                    <Row className="g-3">
                      {(metrics.byColumn ?? []).map((column) => (
                        <Col md={4} key={column.columnId}>
                          <div className="border rounded p-2">
                            <div className="d-flex justify-content-between">
                              <strong>{column.columnName}</strong>
                              <span>
                                {column.count}
                                {column.wipLimit !== null ? ` / ${column.wipLimit}` : ""}
                              </span>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  )}
                </CardBody>
              </Card>
            </Col>

            <Col md={12}>
              <Card className="mb-0">
                <CardHeader>Colunas com WIP excedido</CardHeader>
                <CardBody>
                  {!filters.boardId ? (
                    <Alert color="secondary" className="mb-0">
                      Selecione um board para ver colunas com WIP excedido.
                    </Alert>
                  ) : metrics.columnsOverWip.length === 0 ? (
                    <p className="text-muted mb-0">Nenhuma coluna excedeu o limite de WIP.</p>
                  ) : (
                    metrics.columnsOverWip.map((column) => (
                      <Alert color="warning" key={column.columnId} className="mb-2">
                        <strong>{column.columnName}</strong>: {column.count} cards (limite {column.wipLimit})
                      </Alert>
                    ))
                  )}
                </CardBody>
              </Card>
            </Col>

            <Col md={12}>
              <Card className="mb-0">
                <CardHeader>Tempo médio por coluna</CardHeader>
                <CardBody>
                  {!filters.boardId ? (
                    <Alert color="secondary" className="mb-0">
                      Selecione um board para ver o tempo médio por coluna.
                    </Alert>
                  ) : (
                    <Table responsive className="mb-0 align-middle">
                      <thead>
                        <tr>
                          <th>Coluna</th>
                          <th>Tempo médio</th>
                          <th>Visitas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(metrics.leadTimeByColumn ?? []).map((column) => (
                          <tr key={column.columnId}>
                            <td>{column.columnName}</td>
                            <td>{formatDuration(column.avgDurationSeconds)}</td>
                            <td>{column.visitsCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </Col>
          </Row>
        )
      ) : null}
    </div>
  );
}
