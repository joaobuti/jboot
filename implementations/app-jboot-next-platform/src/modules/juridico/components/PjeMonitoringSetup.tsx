"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Spinner } from "reactstrap";
import {
  juridicoApi,
  PjeMonitoringConfig,
  PjeSyncJob,
} from "@/modules/juridico/lib/juridico-api";
import { UF_LIST } from "@/modules/juridico/lib/ufs";

const STATUS_BADGE: Record<PjeSyncJob["status"], { label: string; className: string }> = {
  queued: { label: "Na fila", className: "bg-secondary-subtle text-secondary" },
  running: { label: "Sincronizando", className: "bg-info-subtle text-info" },
  completed: { label: "Concluída", className: "bg-success-subtle text-success" },
  failed: { label: "Falhou", className: "bg-danger-subtle text-danger" },
  cancelled: { label: "Cancelada", className: "bg-warning-subtle text-warning" },
};

interface Props {
  onSyncFinished?: () => void;
}

export default function PjeMonitoringSetup({ onSyncFinished }: Props) {
  const [config, setConfig] = useState<PjeMonitoringConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [numeroOab, setNumeroOab] = useState("");
  const [ufOab, setUfOab] = useState("");
  const [nomeAdvogado, setNomeAdvogado] = useState("");
  const [nomeParte, setNomeParte] = useState("");
  const [siglasTribunal, setSiglasTribunal] = useState("");
  const [lookbackDays, setLookbackDays] = useState("7");

  const [job, setJob] = useState<PjeSyncJob | null>(null);
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyConfig = useCallback((data: PjeMonitoringConfig) => {
    setConfig(data);
    setNumeroOab(data.numeroOab ?? "");
    setUfOab(data.ufOab ?? "");
    setNomeAdvogado(data.nomeAdvogado ?? "");
    setNomeParte(data.nomeParte ?? "");
    setSiglasTribunal((data.siglasTribunal ?? []).join(", "));
    setLookbackDays(String(data.lookbackDays ?? 7));
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      applyConfig(await juridicoApi.pje.getConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configuração do PJe");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling();
      const sync = async () => {
        try {
          const status = await juridicoApi.pje.getSync(jobId);
          setJob(status);
          if (["completed", "failed", "cancelled"].includes(status.status)) {
            stopPolling();
            setSyncing(false);
            onSyncFinished?.();
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erro ao acompanhar a sincronização");
          stopPolling();
          setSyncing(false);
        }
      };
      void sync();
      pollRef.current = setInterval(sync, 4000);
    },
    [onSyncFinished, stopPolling],
  );

  const loadActiveJob = useCallback(async () => {
    try {
      const active = await juridicoApi.pje.getActiveSync();
      if ("jobId" in active) {
        setJob(active);
        if (["queued", "running"].includes(active.status)) {
          setSyncing(true);
          pollJob(active.jobId);
        }
      }
    } catch {
      // sem job ativo — estado inicial permanece vazio
    }
  }, [pollJob]);

  useEffect(() => {
    void loadConfig();
    void loadActiveJob();
    return stopPolling;
  }, [loadConfig, loadActiveJob, stopPolling]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const siglas = siglasTribunal
        .split(",")
        .map((sigla) => sigla.trim().toUpperCase())
        .filter(Boolean);

      const updated = await juridicoApi.pje.updateConfig({
        numeroOab: numeroOab.trim() || undefined,
        ufOab: ufOab.trim() || undefined,
        nomeAdvogado: nomeAdvogado.trim() || undefined,
        nomeParte: nomeParte.trim() || undefined,
        siglasTribunal: siglas,
        lookbackDays: Number(lookbackDays) || 7,
        status: "active",
      });
      applyConfig(updated);
      setFeedback("Monitoramento salvo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar monitoramento");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setFeedback(null);
    try {
      const started = await juridicoApi.pje.startSync({ lookbackDays: Number(lookbackDays) || undefined });
      setJob(started);
      pollJob(started.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar sincronização");
      setSyncing(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      await juridicoApi.pje.cancelSync(job.jobId);
      stopPolling();
      setSyncing(false);
      setJob({ ...job, status: "cancelled" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cancelar sincronização");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardBody className="text-center py-4">
          <Spinner size="sm" color="primary" />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="d-flex align-items-center justify-content-between">
        <h5 className="card-title mb-0">Monitoramento DJEN</h5>
        {config?.configured ? (
          <Badge className="bg-success-subtle text-success">Configurado</Badge>
        ) : (
          <Badge className="bg-secondary-subtle text-secondary">Não configurado</Badge>
        )}
      </CardHeader>
      <CardBody>
        {error && <Alert color="danger">{error}</Alert>}
        {feedback && <Alert color="success">{feedback}</Alert>}

        <form onSubmit={handleSave}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="pje-numero-oab">Número da OAB</label>
              <Input
                id="pje-numero-oab"
                value={numeroOab}
                onChange={(e) => setNumeroOab(e.target.value.replace(/\D/g, ""))}
                placeholder="18312"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="pje-uf-oab">UF</label>
              <Input
                id="pje-uf-oab"
                type="select"
                value={ufOab}
                onChange={(e) => setUfOab(e.target.value)}
              >
                <option value="">—</option>
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </Input>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="pje-nome-advogado">Nome do advogado</label>
              <Input
                id="pje-nome-advogado"
                value={nomeAdvogado}
                onChange={(e) => setNomeAdvogado(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="pje-nome-parte">Nome da parte</label>
              <Input
                id="pje-nome-parte"
                value={nomeParte}
                onChange={(e) => setNomeParte(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="pje-tribunais">Tribunais</label>
              <Input
                id="pje-tribunais"
                value={siglasTribunal}
                onChange={(e) => setSiglasTribunal(e.target.value)}
                placeholder="TJMS, TRF3"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="pje-lookback">Janela (dias)</label>
              <Input
                id="pje-lookback"
                type="number"
                min={1}
                max={90}
                value={lookbackDays}
                onChange={(e) => setLookbackDays(e.target.value)}
              />
            </div>
          </div>

          <p className="text-muted mt-3 mb-3">
            A consulta exige ao menos OAB + UF, nome do advogado, nome da parte ou sigla de tribunal.
          </p>

          <div className="d-flex gap-2">
            <Button type="submit" color="primary" disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Salvar monitoramento"}
            </Button>
            <Button
              type="button"
              color="success"
              outline
              onClick={handleSync}
              disabled={!config?.configured || syncing}
            >
              {syncing ? <Spinner size="sm" /> : "Sincronizar agora"}
            </Button>
            {syncing && job && (
              <Button type="button" color="danger" outline onClick={handleCancel}>
                Cancelar
              </Button>
            )}
          </div>
        </form>

        {job && (
          <div className="mt-4 border-top pt-3">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="fw-medium">Última sincronização</span>
              <Badge className={STATUS_BADGE[job.status].className}>
                {STATUS_BADGE[job.status].label}
              </Badge>
              {job.dataInicio && job.dataFim && (
                <span className="text-muted">
                  {job.dataInicio} a {job.dataFim}
                </span>
              )}
            </div>
            <div className="row text-center g-2">
              <div className="col">
                <div className="fs-5 fw-semibold">{job.comunicacoesRecebidas}</div>
                <div className="text-muted small">Recebidas</div>
              </div>
              <div className="col">
                <div className="fs-5 fw-semibold text-success">{job.comunicacoesNovas}</div>
                <div className="text-muted small">Novas</div>
              </div>
              <div className="col">
                <div className="fs-5 fw-semibold text-muted">{job.comunicacoesDuplicadas}</div>
                <div className="text-muted small">Já conhecidas</div>
              </div>
              <div className="col">
                <div className="fs-5 fw-semibold">{job.paginasLidas}</div>
                <div className="text-muted small">Páginas</div>
              </div>
              <div className="col">
                <div className="fs-5 fw-semibold text-warning">{job.rateLimitWaits}</div>
                <div className="text-muted small">Esperas de limite</div>
              </div>
            </div>
            {job.lastError && <Alert color="danger" className="mt-3 mb-0">{job.lastError}</Alert>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
