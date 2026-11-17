"use client";

import React, { useCallback, useEffect, useState } from "react";
import { juridicoApi, SchedulingConfigDto, SchedulingInterval } from "@/modules/juridico/lib/juridico-api";

const INTERVALS: { value: SchedulingInterval; label: string }[] = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
];

interface Props {
  portalSlug: string;
}

export default function SchedulingConfigSection({ portalSlug }: Props) {
  const [config, setConfig] = useState<SchedulingConfigDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<SchedulingInterval | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await juridicoApi.captacao.getConfig(portalSlug);
      setConfig(data);
      setSelected((data.interval as SchedulingInterval) ?? "");
    } catch {
      // non-blocking
    } finally {
      setLoading(false);
    }
  }, [portalSlug]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await juridicoApi.captacao.setConfig(portalSlug, selected);
      setConfig(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">
          <i className="ri-time-line me-2" />
          Agendamento de Consulta
        </h5>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger py-2 mb-3">
            <i className="ri-error-warning-line me-2" />
            {error}
          </div>
        )}
        {saved && (
          <div className="alert alert-success py-2 mb-3">
            <i className="ri-checkbox-circle-line me-2" />
            Configuração salva.
          </div>
        )}

        <div className="mb-3">
          <label className="form-label">Periodicidade do robô</label>
          <select
            className="form-select"
            value={selected}
            onChange={(e) => { setSaved(false); setSelected(e.target.value as SchedulingInterval); }}
            disabled={saving}
          >
            <option value="">Selecione...</option>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>

        {config?.lastRunAt && (
          <p className="text-muted small mb-2">
            Última execução:{" "}
            {new Date(config.lastRunAt).toLocaleString("pt-BR")}
          </p>
        )}
        {config?.nextRunAt && (
          <p className="text-muted small mb-3">
            Próxima execução:{" "}
            {new Date(config.nextRunAt).toLocaleString("pt-BR")}
          </p>
        )}

        <button
          className="btn btn-primary btn-sm"
          onClick={() => void handleSave()}
          disabled={saving || !selected}
        >
          {saving ? (
            <span className="spinner-border spinner-border-sm me-1" role="status" />
          ) : (
            <i className="ri-save-line me-1" />
          )}
          Salvar
        </button>
      </div>
    </div>
  );
}
