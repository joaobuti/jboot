"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Offcanvas,
  OffcanvasBody,
  OffcanvasHeader,
  Row,
  Spinner
} from "reactstrap";
import { getApplicationScopes } from "@/lib/module-auth-token";
import {
  ComandaSalaoComanda,
  ComandaSalaoMesa,
  ComandaSalaoMesaState,
  comandaAdminApi
} from "@/modules/pdv/lib/comanda-admin-api";
import { ComandaFechamentoModal, formatCurrency } from "./ComandaFechamentoModal";

const STATE_META: Record<
  ComandaSalaoMesaState,
  { label: string; color: string; icon: string; priority: number }
> = {
  item_pronto: { label: "Item pronto", color: "success", icon: "ri-checkbox-circle-line", priority: 0 },
  conta_solicitada: { label: "Conta solicitada", color: "warning", icon: "ri-bill-line", priority: 1 },
  pagamento_parcial: { label: "Pago em parte", color: "primary", icon: "ri-cash-line", priority: 2 },
  esquecida: { label: "Sem atividade", color: "danger", icon: "ri-alarm-warning-line", priority: 3 },
  ocupada: { label: "Ocupada", color: "info", icon: "ri-group-line", priority: 4 },
  livre: { label: "Livre", color: "light", icon: "ri-checkbox-blank-circle-line", priority: 5 },
  inativa: { label: "Inativa", color: "secondary", icon: "ri-forbid-line", priority: 6 }
};

/** Ordem de leitura do balcao: o que exige acao primeiro, mesa livre por ultimo. */
function sortMesas(mesas: ComandaSalaoMesa[]): ComandaSalaoMesa[] {
  return [...mesas].sort((a, b) => {
    const byPriority = STATE_META[a.state].priority - STATE_META[b.state].priority;
    return byPriority !== 0 ? byPriority : a.tableNumber - b.tableNumber;
  });
}

function maskDocument(document: string | null): string | null {
  if (!document) {
    return null;
  }
  const digits = document.replace(/\D/g, "");
  if (digits.length !== 11) {
    return document;
  }
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatElapsed(iso: string): string {
  const minutes = minutesSince(iso);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, "0")}`;
}

export function ComandaSalaoPage() {
  const [mesas, setMesas] = useState<ComandaSalaoMesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null);
  const [fechamentoTarget, setFechamentoTarget] = useState<ComandaSalaoComanda | null>(null);

  const canManageMesas = useMemo(
    () => getApplicationScopes("app:pdv", "pdvAccessToken").includes("pdv:admin:write"),
    []
  );

  const load = useCallback(async () => {
    try {
      setMesas(await comandaAdminApi.salao());
      setLoadError(null);
    } catch (err) {
      // Mantem o ultimo estado renderizado: e tela de parede do balcao, nao
      // pode piscar em branco a cada falha de rede.
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar o salao");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
  }, [load]);

  const ordered = useMemo(() => sortMesas(mesas), [mesas]);
  const selectedMesa = mesas.find((mesa) => mesa.mesaId === selectedMesaId) ?? null;

  if (loading) {
    return (
      <div className="page-content d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <h5 className="mb-0">
          <i className="ri-layout-grid-line me-2" />
          Salão — Operador de Balcão
        </h5>
        <div className="d-flex align-items-center gap-2">
          {(Object.keys(STATE_META) as ComandaSalaoMesaState[]).map((state) => (
            <span key={state} className="d-inline-flex align-items-center text-muted small">
              <Badge color={STATE_META[state].color} className="me-1">&nbsp;</Badge>
              {STATE_META[state].label}
            </span>
          ))}
          {canManageMesas && (
            <Link href="/pdv/comanda/mesas" className="btn btn-primary btn-sm">
              <i className="ri-add-line me-1" />
              Cadastrar mesa
            </Link>
          )}
        </div>
      </div>

      {loadError && <Alert color="danger">{loadError}</Alert>}

      {mesas.length === 0 ? (
        <Card>
          <CardBody className="text-center py-5">
            <i className="ri-layout-grid-line display-5 d-block mb-2 text-muted" />
            <p className="text-muted mb-3">Nenhuma mesa cadastrada — o salão só existe depois do cadastro.</p>
            {canManageMesas && (
              <Link href="/pdv/comanda/mesas" className="btn btn-primary btn-sm">
                <i className="ri-add-line me-1" />
                Cadastrar mesa
              </Link>
            )}
          </CardBody>
        </Card>
      ) : (
        <Row className="g-3">
          {ordered.map((mesa) => {
            const meta = STATE_META[mesa.state];
            const prontos = mesa.comandas.reduce((acc, comanda) => acc + comanda.itensProntos, 0);
            const contaSolicitada = mesa.comandas.some((comanda) => comanda.closingRequestedAt);
            const ultimaAtividade = mesa.comandas
              .map((comanda) => comanda.lastActivityAt)
              .sort()
              .at(-1);
            const pagoMesa = mesa.comandas.reduce((acc, comanda) => acc + Number(comanda.pago), 0);
            const saldoMesa = mesa.comandas.reduce((acc, comanda) => acc + Number(comanda.saldo), 0);

            return (
              <Col key={mesa.mesaId} xs={6} md={4} lg={3} xxl={2}>
                <Card
                  className="h-100 mb-0"
                  role="button"
                  onClick={() => setSelectedMesaId(mesa.mesaId)}
                  style={{ borderTop: `4px solid var(--vz-${meta.color})`, cursor: "pointer" }}
                >
                  <CardBody className="p-3">
                    <div className="d-flex align-items-start justify-content-between">
                      <div>
                        <div className="fs-3 fw-semibold lh-1">{mesa.tableNumber}</div>
                        <div className="text-muted small text-truncate" style={{ maxWidth: 130 }}>
                          {mesa.label ?? "Mesa"}
                        </div>
                      </div>
                      <i className={`${meta.icon} fs-4 text-${meta.color}`} />
                    </div>

                    <div className="mt-2">
                      <Badge color={meta.color} className="mb-1">{meta.label}</Badge>
                    </div>

                    {mesa.comandasAbertas > 0 && (
                      <>
                        <div className="d-flex align-items-center text-muted small mt-1">
                          <i className="ri-user-3-line me-1" />
                          {/* Comanda e individual: N pessoas na mesma mesa = N comandas. */}
                          {mesa.comandasAbertas} comanda(s) aberta(s)
                        </div>
                        <div className="fw-medium mt-1">{formatCurrency(mesa.totalMesa)}</div>
                        {pagoMesa > 0 && (
                          <div className="text-primary small">
                            Pago {formatCurrency(String(pagoMesa))} · falta{" "}
                            {formatCurrency(String(saldoMesa))}
                          </div>
                        )}
                        {ultimaAtividade && (
                          <div className="text-muted small">Últ. atividade há {formatElapsed(ultimaAtividade)}</div>
                        )}
                        <div className="d-flex gap-1 flex-wrap mt-2">
                          {prontos > 0 && (
                            <Badge color="success" className="fw-normal">{prontos} pronto(s)</Badge>
                          )}
                          {contaSolicitada && (
                            <Badge color="warning" className="fw-normal">conta</Badge>
                          )}
                        </div>
                      </>
                    )}
                  </CardBody>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Offcanvas
        isOpen={!!selectedMesa}
        toggle={() => setSelectedMesaId(null)}
        direction="end"
        className="offcanvas-end"
      >
        <OffcanvasHeader toggle={() => setSelectedMesaId(null)}>
          Mesa {selectedMesa?.tableNumber}
          {selectedMesa?.label ? ` — ${selectedMesa.label}` : ""}
        </OffcanvasHeader>
        <OffcanvasBody>
          {selectedMesa && selectedMesa.comandas.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="ri-checkbox-blank-circle-line fs-3 d-block mb-2" />
              Mesa sem comanda aberta.
            </div>
          ) : (
            selectedMesa?.comandas.map((comanda) => (
              <Card key={comanda.comandaId} className="mb-2">
                <CardBody className="p-3">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="fw-medium">{comanda.customerName}</div>
                      <div className="text-muted small">
                        {comanda.customerPhone ?? maskDocument(comanda.customerDocumentNumber) ?? "—"}
                      </div>
                    </div>
                    <div className="fw-semibold">{formatCurrency(comanda.total)}</div>
                  </div>

                  {Number(comanda.pago) > 0 && (
                    <div className="text-primary small mt-1">
                      Pago {formatCurrency(comanda.pago)} · falta {formatCurrency(comanda.saldo)}
                    </div>
                  )}

                  <div className="d-flex gap-1 flex-wrap mt-2">
                    {comanda.closingRequestedAt && <Badge color="warning">Conta solicitada</Badge>}
                    {comanda.isForgotten && <Badge color="danger">Sem atividade</Badge>}
                    {comanda.itensProntos > 0 && (
                      <Badge color="success">{comanda.itensProntos} pronto(s)</Badge>
                    )}
                    {comanda.itensEmProducao > 0 && (
                      <Badge color="info">{comanda.itensEmProducao} em produção</Badge>
                    )}
                    {comanda.itensPendentes > 0 && (
                      <Badge color="secondary">{comanda.itensPendentes} pendente(s)</Badge>
                    )}
                  </div>

                  <div className="text-muted small mt-2">
                    Aberta há {formatElapsed(comanda.openedAt)} · última atividade há{" "}
                    {formatElapsed(comanda.lastActivityAt)}
                  </div>

                  <Button
                    color="primary"
                    size="sm"
                    className="mt-2"
                    onClick={() => setFechamentoTarget(comanda)}
                  >
                    <i className="ri-bill-line me-1" />
                    {Number(comanda.pago) > 0 ? "Receber saldo" : "Fechar comanda"}
                  </Button>
                </CardBody>
              </Card>
            ))
          )}
        </OffcanvasBody>
      </Offcanvas>

      <ComandaFechamentoModal
        comandaId={fechamentoTarget?.comandaId ?? null}
        tableNumber={selectedMesa?.tableNumber}
        onCancel={() => setFechamentoTarget(null)}
        onClosed={() => {
          setFechamentoTarget(null);
          void load();
        }}
      />
    </div>
  );
}
