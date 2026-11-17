"use client";

import { useEffect, useState } from "react";
import { Spinner } from "reactstrap";
import { CardDjenDto, DjenCadenceDays, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { isMonitoredSourceType } from "@/modules/kanban/lib/card-actions";
import LockedSourceSignal from "@/modules/kanban/components/LockedSourceSignal";
import { DJEN_CADENCE_OPTIONS, DJEN_NOT_CONTRACTED, djenCadenceWarning, djenErrorMessage, djenToggleTitle } from "@/modules/kanban/lib/djen-control";

interface CardDjenControlProps {
  cardId: string;
  sourceType: string | null;
}

/**
 * Sinalizacao do DJEN no cabecalho do card (ADR 022), independente da do DataJud: olho proprio e
 * frequencia em dias uteis (1, 3, 7). Aparece quando o card tem acompanhamento; sem a capacidade
 * `publicacoes-processuais` fica visivel, porem bloqueado.
 */
export default function CardDjenControl({ cardId, sourceType }: CardDjenControlProps) {
  const [state, setState] = useState<CardDjenDto | null>(null);
  const [saving, setSaving] = useState<"toggle" | DjenCadenceDays | null>(null);
  const [error, setError] = useState<string | null>(null);
  const monitored = isMonitoredSourceType(sourceType);

  useEffect(() => {
    if (!monitored) return;
    let active = true;
    kanbanApi.sourceMonitoring
      .get(cardId)
      .then((result) => { if (active && result.djen) setState(result.djen); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [cardId, monitored]);

  if (!monitored || !state) return null;
  if (!state.available) {
    return (
      <div className="ms-2">
        <LockedSourceSignal label="DJEN" reason={DJEN_NOT_CONTRACTED} />
      </div>
    );
  }

  function fail(failure: unknown) {
    setError(djenErrorMessage(failure));
    setTimeout(() => setError(null), 4000);
  }

  async function toggle() {
    if (!state || saving) return;
    setSaving("toggle");
    setError(null);
    try {
      setState(await kanbanApi.sourceMonitoring.setDjen(cardId, !state.enabled));
    } catch (failure) {
      fail(failure);
    } finally {
      setSaving(null);
    }
  }

  async function selectCadence(days: DjenCadenceDays) {
    if (!state || saving || days === state.cadenceDays) return;
    setSaving(days);
    setError(null);
    try {
      setState(await kanbanApi.sourceMonitoring.updateDjenCadence(cardId, days));
    } catch (failure) {
      fail(failure);
    } finally {
      setSaving(null);
    }
  }

  const warning = state.enabled ? djenCadenceWarning(state.cadenceDays) : null;

  return (
    <div className="d-flex align-items-center gap-1 ms-2">
      <span className="small text-muted fw-semibold">DJEN</span>
      <button
        type="button"
        title={error ?? djenToggleTitle(state.enabled)}
        aria-label="Alternar publicações do DJEN"
        aria-pressed={state.enabled}
        disabled={saving !== null}
        onClick={() => void toggle()}
        className={`d-flex align-items-center justify-content-center rounded-circle border-0 p-0 ${
          error ? "bg-danger text-white" : state.enabled ? "bg-success text-white" : "bg-light text-muted"
        }`}
        style={{ width: 24, height: 24, fontSize: 12 }}
      >
        {saving === "toggle" ? <Spinner style={{ width: 11, height: 11 }} /> : <i className={state.enabled ? "ri-eye-line" : "ri-eye-off-line"} />}
      </button>
      {state.enabled &&
        DJEN_CADENCE_OPTIONS.map((option) => {
          const isActive = option.days === state.cadenceDays;
          return (
            <button
              key={option.days}
              type="button"
              title={option.label}
              aria-label={option.label}
              aria-pressed={isActive}
              disabled={saving !== null}
              onClick={() => void selectCadence(option.days)}
              className={`d-flex align-items-center justify-content-center rounded-circle border-0 p-0 fw-semibold lh-1 ${
                isActive ? "bg-success text-white" : "bg-light text-muted"
              }`}
              style={{ width: 24, height: 24, fontSize: 10 }}
            >
              {saving === option.days ? <Spinner style={{ width: 11, height: 11 }} /> : option.days}
            </button>
          );
        })}
      {warning && <i className="ri-error-warning-line text-warning" title={warning} aria-label={warning} />}
    </div>
  );
}
