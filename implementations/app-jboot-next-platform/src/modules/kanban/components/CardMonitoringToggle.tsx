"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "reactstrap";
import { KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { isMonitoredSourceType } from "@/modules/kanban/lib/card-actions";
import { DATAJUD_NOT_CONTRACTED } from "@/modules/kanban/lib/djen-control";
import LockedSourceSignal from "@/modules/kanban/components/LockedSourceSignal";

interface CardMonitoringToggleProps {
  cardId: string;
  sourceType: string | null;
  /** Propaga o estado atual para o pai poder repassar ao controle de
   * cadencia (bolinhas), que fica ao lado deste botao. */
  onChange?: (monitoring: boolean) => void;
}

/**
 * Controle compacto de ligar/desligar o monitoramento, posicionado no
 * cabecalho do card ao lado de `CardMonitoringCadenceControl` (mesmo assunto:
 * monitoramento DataJud). O detalhamento textual (descricao, link para a
 * consulta original) continua em `CardSourceMonitoringPanel`, na lateral do
 * card — aqui fica so a acao.
 *
 * A chamada nasce no contexto Flow; o backend resolve e autoriza o contexto
 * Juridico server-side.
 */
export default function CardMonitoringToggle({ cardId, sourceType, onChange }: CardMonitoringToggleProps) {
  const [monitoring, setMonitoring] = useState<boolean | null>(null);
  const [hasSource, setHasSource] = useState(true);
  const [contracted, setContracted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card exportado do DataJud ou card de monitoramento de peticao (Sprint 2 de flow-card-actions).
  const isDataJudCard = isMonitoredSourceType(sourceType);

  const request = useCallback(async (method: "GET" | "POST", monitor?: boolean) => {
    try {
      if (method === "GET") return await kanbanApi.sourceMonitoring.get(cardId);
      const changed = await kanbanApi.sourceMonitoring.set(cardId, Boolean(monitor));
      return { hasSource: true, contracted: true, monitoring: changed.monitoring };
    } catch (failure) {
      if (method === "POST") throw failure;
      return null;
    }
  }, [cardId]);

  useEffect(() => {
    if (!isDataJudCard) {
      setLoading(false);
      return;
    }
    let active = true;
    request("GET")
      .then((result) => {
        if (!active || !result) return;
        setMonitoring(result.monitoring);
        setHasSource(result.hasSource);
        setContracted(result.contracted !== false);
        onChange?.(result.monitoring);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isDataJudCard, request]);

  if (!isDataJudCard || loading || !hasSource || monitoring === null) {
    return null;
  }

  if (!contracted) return <LockedSourceSignal label="DataJud" reason={DATAJUD_NOT_CONTRACTED} />;

  async function handleToggle() {
    const next = !monitoring;
    setSaving(true);
    setError(null);
    setMonitoring(next);
    onChange?.(next);
    try {
      const result = await request("POST", next);
      if (!result) throw new Error("falha");
      setMonitoring(result.monitoring);
      onChange?.(result.monitoring);
    } catch (failure) {
      setMonitoring(!next);
      onChange?.(!next);
      setError(toggleErrorMessage(failure));
      setTimeout(() => setError(null), 4000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <span className="small text-muted fw-semibold">DataJud</span>
    <button
      type="button"
      title={error ?? (monitoring ? "Consulta ao DataJud ativa — clique para pausar" : "Consulta ao DataJud pausada — clique para ativar")}
      aria-label="Alternar consulta ao DataJud"
      aria-pressed={monitoring}
      disabled={saving}
      onClick={() => void handleToggle()}
      className={`d-flex align-items-center justify-content-center rounded-circle border-0 p-0 ${
        error ? "bg-danger text-white" : monitoring ? "bg-success text-white" : "bg-light text-muted"
      }`}
      style={{ width: 24, height: 24, fontSize: 12 }}
    >
      {saving ? <Spinner style={{ width: 11, height: 11 }} /> : <i className={monitoring ? "ri-eye-line" : "ri-eye-off-line"} />}
    </button>
    </>
  );
}

/** Motivo da recusa no title do botao: processo acompanhado no Juridico ou capacidade nao contratada. */
function toggleErrorMessage(error: unknown): string {
  if (error instanceof KanbanApiError) {
    if (error.code === "process_monitor_in_use") return "Este processo já é acompanhado no Jurídico.";
    if (error.code === "process_monitoring_not_contracted") return "Monitoramento processual não contratado. Peça ao administrador.";
  }
  return "Não foi possível alterar o monitoramento.";
}
