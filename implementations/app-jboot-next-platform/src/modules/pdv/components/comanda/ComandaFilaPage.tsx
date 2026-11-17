"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Spinner } from "reactstrap";
import { ComandaAdminItem, ComandaQueueType, comandaAdminApi } from "@/modules/pdv/lib/comanda-admin-api";
import { ComandaQueueList } from "./ComandaQueueList";

const LABELS: Record<ComandaQueueType, { title: string; icon: string; emptyMessage: string }> = {
  cozinha: { title: "Fila — Cozinha", icon: "ri-restaurant-2-line", emptyMessage: "Nenhum item em produção na cozinha." },
  bar: { title: "Fila — Bar", icon: "ri-goblet-line", emptyMessage: "Nenhum item em produção no bar." }
};

interface ComandaFilaPageProps {
  queueType: ComandaQueueType;
}

export function ComandaFilaPage({ queueType }: ComandaFilaPageProps) {
  const [items, setItems] = useState<ComandaAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const label = LABELS[queueType];

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await comandaAdminApi.fila(queueType);
      setItems(result);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar fila");
    } finally {
      setLoading(false);
    }
  }, [queueType]);

  useEffect(() => {
    setLoading(true);
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleFinalizar(item: ComandaAdminItem) {
    setActionError(null);
    setActionLoadingId(item.id);
    try {
      await comandaAdminApi.finalizar(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao finalizar item");
    } finally {
      setActionLoadingId(null);
    }
  }

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
        <i className={`${label.icon} me-2`} />
        {label.title}
      </h5>

      {loadError && <Alert color="danger">{loadError}</Alert>}
      {actionError && <Alert color="danger">{actionError}</Alert>}

      <ComandaQueueList
        title={label.title}
        icon={label.icon}
        items={items}
        loading={false}
        error={null}
        emptyIcon={label.icon}
        emptyMessage={label.emptyMessage}
        actionLabel="Finalizar"
        actionIcon="ri-check-double-line"
        actionColor="success"
        actionLoadingId={actionLoadingId}
        onAction={(item) => void handleFinalizar(item)}
        timestampField="encaminhadoAt"
        timestampLabel="Encaminhado às"
      />
    </div>
  );
}
