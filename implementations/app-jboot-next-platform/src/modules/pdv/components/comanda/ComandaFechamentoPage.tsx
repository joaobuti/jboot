"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Spinner, Table } from "reactstrap";
import { ComandaListItem, comandaAdminApi } from "@/modules/pdv/lib/comanda-admin-api";
import { ComandaFechamentoModal, formatCurrency } from "./ComandaFechamentoModal";

export function ComandaFechamentoPage() {
  const [comandas, setComandas] = useState<ComandaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<ComandaListItem | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await comandaAdminApi.listComandas();
      setComandas(result);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar comandas abertas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="page-content d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <div className="page-content">
      <h5 className="mb-3">
        <i className="ri-bill-line me-2" />
        Fechamento de Comandas — Operador de Balcão
      </h5>

      {loadError && <Alert color="danger">{loadError}</Alert>}

      <Card>
        <CardHeader className="d-flex align-items-center justify-content-between">
          <h6 className="mb-0">Comandas abertas</h6>
          <Badge color="secondary" pill>{comandas.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">
          {comandas.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="ri-bill-line display-5 d-block mb-2" />
              Nenhuma comanda aberta no momento.
            </div>
          ) : (
            <Table hover responsive className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>Mesa</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th className="text-end">Total</th>
                  <th className="text-end">Ações</th>
                </tr>
              </thead>
              <tbody>
                {comandas.map((comanda) => (
                  <tr key={comanda.id}>
                    <td>
                      <Badge color="light" className="text-dark border">Mesa {comanda.tableNumber}</Badge>
                    </td>
                    <td>
                      <div className="fw-medium">{comanda.customerName}</div>
                      <div className="text-muted small">{comanda.customerPhone ?? comanda.customerDocumentNumber}</div>
                    </td>
                    <td>
                      {comanda.closingRequestedAt && (
                        <Badge color="warning" className="me-1">Fechamento solicitado</Badge>
                      )}
                      {comanda.isForgotten && <Badge color="danger">Comanda esquecida</Badge>}
                      {!comanda.closingRequestedAt && !comanda.isForgotten && (
                        <span className="text-muted small">Em andamento</span>
                      )}
                    </td>
                    <td className="text-end fw-medium">{formatCurrency(comanda.total)}</td>
                    <td className="text-end">
                      <Button size="sm" color="primary" onClick={() => setTarget(comanda)}>
                        <i className="ri-bill-line me-1" />
                        Fechar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ComandaFechamentoModal
        comandaId={target?.id ?? null}
        tableNumber={target?.tableNumber}
        onCancel={() => setTarget(null)}
        onClosed={(comandaId) => {
          setComandas((prev) => prev.filter((c) => c.id !== comandaId));
          setTarget(null);
        }}
      />
    </div>
  );
}
