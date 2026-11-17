"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Col,
  Input,
  Row,
  Spinner,
  Table
} from "reactstrap";
import { pdvApi, DashboardData, DashboardPeriod, PdvStockLocation } from "@/modules/pdv/lib/pdv-api";
import Cookies from "js-cookie";

// ─── JWT decode helper ─────────────────────────────────────────────────────────

function decodePdvToken(): { roles: string[]; locationId?: string } {
  const token = Cookies.get("pdvAccessToken");
  if (!token) return { roles: [] };
  const [, payload] = token.split(".");
  if (!payload) return { roles: [] };
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const p = JSON.parse(atob(padded)) as Record<string, unknown>;
    return {
      roles: Array.isArray(p.roles) ? p.roles.map(String) : [],
      locationId: typeof p.location_id === "string" ? p.location_id : undefined
    };
  } catch {
    return { roles: [] };
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function brl(value: string | number): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês"
};

const METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  pix: "PIX",
  outro: "Outro"
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [selectedLocation, setSelectedLocation] = useState<string>(""); // "" = todas
  const [stores, setStores] = useState<PdvStockLocation[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { roles, locationId: myLocationId } = decodePdvToken();
  const isAdmin = roles.includes("admin");

  // Load store list for admin selector
  useEffect(() => {
    if (!isAdmin) return;
    pdvApi.stockLocations
      .list()
      .then((r) => setStores(r.data.filter((s) => s.status === "active")))
      .catch(() => setStores([]));
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { period: DashboardPeriod; locationId?: string } = { period };
      if (isAdmin && selectedLocation) params.locationId = selectedLocation;
      if (!isAdmin && myLocationId) params.locationId = myLocationId;
      setData(await pdvApi.dashboard.get(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }, [period, selectedLocation, isAdmin, myLocationId]);

  useEffect(() => { void load(); }, [load]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalPayments = data?.paymentMethods.reduce((s, m) => s + Number(m.amount), 0) ?? 0;

  return (
    <div className="page-content">
      {/* Header + filters */}
      <Row className="mb-3 align-items-center g-2">
        <Col>
          <h4 className="mb-0">Dashboard PDV</h4>
          {!isAdmin && (
            <p className="text-muted small mb-0 mt-1">
              Métricas da sua loja
            </p>
          )}
        </Col>
        <Col xs="auto" className="d-flex gap-2 align-items-center flex-wrap">
          {isAdmin && stores.length > 1 && (
            <Input
              type="select"
              bsSize="sm"
              style={{ minWidth: 160 }}
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="">Todas as lojas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.isMatriz ? " (Matriz)" : ""}
                </option>
              ))}
            </Input>
          )}
          <div className="btn-group btn-group-sm">
            {(["today", "week", "month"] as DashboardPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-outline-primary${period === p ? " active" : ""}`}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </Col>
      </Row>

      {error && <Alert color="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-5"><Spinner color="primary" /></div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <Row className="g-3 mb-4">
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted mb-1 small">Faturamento</p>
                    <h4 className="mb-0 fw-semibold">{brl(data.revenue)}</h4>
                  </div>
                  <span className="avatar-title bg-success-subtle text-success rounded fs-3">
                    <i className="ri-money-dollar-circle-line" />
                  </span>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted mb-1 small">Vendas</p>
                    <h4 className="mb-0 fw-semibold">{data.salesCount}</h4>
                  </div>
                  <span className="avatar-title bg-primary-subtle text-primary rounded fs-3">
                    <i className="ri-shopping-cart-2-line" />
                  </span>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted mb-1 small">Ticket Médio</p>
                    <h4 className="mb-0 fw-semibold">{brl(data.averageTicket)}</h4>
                  </div>
                  <span className="avatar-title bg-info-subtle text-info rounded fs-3">
                    <i className="ri-ticket-2-line" />
                  </span>
                </CardBody>
              </Card>
            </Col>
            <Col md={6} xl={3}>
              <Card className="mb-0 h-100">
                <CardBody className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted mb-1 small">Erros Fiscais</p>
                    <h4 className={`mb-0 fw-semibold ${data.fiscalErrors > 0 ? "text-danger" : ""}`}>
                      {data.fiscalErrors}
                    </h4>
                  </div>
                  <span className={`avatar-title rounded fs-3 ${data.fiscalErrors > 0 ? "bg-danger-subtle text-danger" : "bg-secondary-subtle text-secondary"}`}>
                    <i className="ri-file-warning-line" />
                  </span>
                </CardBody>
              </Card>
            </Col>
          </Row>

          {/* Top produtos + métodos de pagamento */}
          <Row className="g-3">
            <Col lg={7}>
              <Card className="h-100 mb-0">
                <CardHeader>
                  <h6 className="mb-0">Top 5 Produtos</h6>
                </CardHeader>
                <CardBody className="p-0">
                  {data.topProducts.length === 0 ? (
                    <p className="text-muted text-center py-4 mb-0 small">Nenhuma venda no período.</p>
                  ) : (
                    <Table className="table-nowrap mb-0" hover>
                      <thead className="table-light">
                        <tr>
                          <th>#</th>
                          <th>Produto</th>
                          <th className="text-end">Qtd</th>
                          <th className="text-end">Receita</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.map((p, i) => (
                          <tr key={p.productId}>
                            <td className="text-muted">{i + 1}</td>
                            <td>{p.productName}</td>
                            <td className="text-end">{p.quantitySold}</td>
                            <td className="text-end fw-semibold">{brl(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </Col>

            <Col lg={5}>
              <Card className="h-100 mb-0">
                <CardHeader>
                  <h6 className="mb-0">Vendas por Método</h6>
                </CardHeader>
                <CardBody>
                  {data.paymentMethods.length === 0 ? (
                    <p className="text-muted text-center py-4 mb-0 small">Nenhuma venda no período.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {data.paymentMethods.map((m) => {
                        const pct = totalPayments > 0 ? (Number(m.amount) / totalPayments) * 100 : 0;
                        return (
                          <div key={m.method}>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="small">{METHOD_LABELS[m.method] ?? m.method}</span>
                              <span className="small fw-semibold">{brl(m.amount)}</span>
                            </div>
                            <div className="progress" style={{ height: 6 }}>
                              <div
                                className="progress-bar bg-primary"
                                style={{ width: `${pct.toFixed(1)}%` }}
                              />
                            </div>
                            <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                              {m.count} venda{m.count !== 1 ? "s" : ""} · {pct.toFixed(1)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardBody>
              </Card>
            </Col>
          </Row>

          {/* Ranking de lojas — apenas admin com todas as lojas selecionadas */}
          {isAdmin && !selectedLocation && stores.length > 1 && (
            <Row className="g-3 mt-0">
              <Col lg={12}>
                <Card className="mb-0">
                  <CardHeader>
                    <h6 className="mb-0">Faturamento por Loja</h6>
                  </CardHeader>
                  <CardBody className="p-0">
                    <StoreRankingTable stores={stores} period={period} />
                  </CardBody>
                </Card>
              </Col>
            </Row>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── Store ranking sub-component ──────────────────────────────────────────────

function StoreRankingTable({ stores, period }: { stores: PdvStockLocation[]; period: DashboardPeriod }) {
  const [rows, setRows] = useState<{ store: PdvStockLocation; revenue: string; salesCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all(
      stores.map((s) =>
        pdvApi.dashboard.get({ period, locationId: s.id }).then((d) => ({
          store: s,
          revenue: d.revenue,
          salesCount: d.salesCount
        }))
      )
    )
      .then((results) => setRows(results.sort((a, b) => Number(b.revenue) - Number(a.revenue))))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [stores, period]);

  if (loading) return <div className="text-center py-3"><Spinner size="sm" /></div>;

  return (
    <Table className="table-nowrap mb-0" hover>
      <thead className="table-light">
        <tr>
          <th>#</th>
          <th>Loja</th>
          <th className="text-end">Vendas</th>
          <th className="text-end">Faturamento</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.store.id}>
            <td className="text-muted">{i + 1}</td>
            <td>
              {r.store.name}
              {r.store.isMatriz && (
                <Badge color="primary" className="ms-2 fw-normal" style={{ fontSize: "0.6rem" }}>Matriz</Badge>
              )}
            </td>
            <td className="text-end">{r.salesCount}</td>
            <td className="text-end fw-semibold">{Number(r.revenue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
