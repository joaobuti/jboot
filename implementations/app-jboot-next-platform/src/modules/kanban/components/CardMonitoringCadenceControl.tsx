"use client";

import { useEffect, useState } from "react";
import { Spinner } from "reactstrap";
import { DataJudMonitorCadence as Cadence, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { isMonitoredSourceType } from "@/modules/kanban/lib/card-actions";

interface CadenceOption {
  cadence: Cadence;
  days: number;
  label: string;
}

const CADENCE_OPTIONS: CadenceOption[] = [
  { cadence: "daily", days: 1, label: "Consulta ao DataJud todo dia" },
  { cadence: "weekly", days: 7, label: "Consulta ao DataJud a cada 7 dias" },
  { cadence: "biweekly", days: 14, label: "Consulta ao DataJud a cada 14 dias" },
  { cadence: "monthly", days: 30, label: "Consulta ao DataJud a cada 30 dias" },
];

interface CardMonitoringCadenceControlProps {
  cardId: string;
  sourceType: string | null;
  /** Quando o toggle de monitoramento (controle irmao no cabecalho) muda,
   * o pai propaga aqui para esconder/mostrar as bolinhas na hora, sem
   * esperar o card ser reaberto. `undefined` = segue o proprio fetch. */
  monitoringOverride?: boolean;
}

/**
 * Cadencia ja e individual por monitor desde a Sprint de Acompanhamentos
 * (`juridico_data_monitors.cadence`). Este controle so expoe um segundo ponto
 * de entrada de UI, direto no card do Flow, para a mesma fonte de verdade
 * (`DataJudMonitorService.update`) que a tela Juridico > Acompanhamentos ja
 * usa — nao existe agendamento paralelo aqui.
 *
 * Mesmo criterio de visibilidade do toggle de monitoramento (Sprint 7): so
 * aparece para card de origem DataJud com monitoramento ativo. A chamada nasce
 * no contexto Flow; o backend resolve e autoriza o contexto Juridico
 * server-side (decisao 2026-10-06-domain-integrations-priority).
 */
export default function CardMonitoringCadenceControl({ cardId, sourceType, monitoringOverride }: CardMonitoringCadenceControlProps) {
  const [cadence, setCadence] = useState<Cadence | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCadence, setSavingCadence] = useState<Cadence | null>(null);
  const [errorCadence, setErrorCadence] = useState<Cadence | null>(null);

  // Card exportado do DataJud ou card de monitoramento de peticao (Sprint 2 de flow-card-actions).
  const isDataJudCard = isMonitoredSourceType(sourceType);

  useEffect(() => {
    if (!isDataJudCard) {
      setLoading(false);
      return;
    }
    let active = true;
    kanbanApi.sourceMonitoring
      .get(cardId)
      .then((result) => {
        if (active && result?.monitoring && result.cadence) {
          setCadence(result.cadence);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cardId, isDataJudCard]);

  if (!isDataJudCard || loading || !cadence || monitoringOverride === false) {
    return null;
  }

  async function handleSelect(next: Cadence) {
    if (next === cadence || savingCadence) {
      return;
    }
    const previous = cadence;
    setCadence(next);
    setSavingCadence(next);
    setErrorCadence(null);
    try {
      await kanbanApi.sourceMonitoring.updateCadence(cardId, next);
    } catch {
      setCadence(previous);
      setErrorCadence(next);
      setTimeout(() => setErrorCadence((current) => (current === next ? null : current)), 2500);
    } finally {
      setSavingCadence(null);
    }
  }

  return (
    <div className="d-flex align-items-center gap-1" title="Frequência da consulta ao DataJud">
      {CADENCE_OPTIONS.map((option) => {
        const isActive = option.cadence === cadence;
        const isSaving = savingCadence === option.cadence;
        const isError = errorCadence === option.cadence;
        return (
          <button
            key={option.cadence}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={isActive}
            disabled={savingCadence !== null}
            onClick={() => void handleSelect(option.cadence)}
            className={`d-flex align-items-center justify-content-center rounded-circle border-0 p-0 fw-semibold lh-1 ${
              isError ? "bg-danger text-white" : isActive ? "bg-success text-white" : "bg-light text-muted"
            }`}
            style={{ width: 24, height: 24, fontSize: 10 }}
          >
            {isSaving ? <Spinner style={{ width: 11, height: 11 }} /> : option.days}
          </button>
        );
      })}
    </div>
  );
}
