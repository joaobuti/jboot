"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Spinner } from "reactstrap";
import {
  EprocConsultationResult,
  EprocQueryJobStatus,
  EprocSessionStatus,
  EprocSetupStatus,
  juridicoApi,
} from "../lib/juridico-api";

type Phase =
  | "idle"
  | "starting"
  | "waiting_2fa"
  | "waiting_profile"
  | "saving"
  | "completed"
  | "failed";

export default function EprocSessionSetup() {
  const [sessionStatus, setSessionStatus] = useState<EprocSessionStatus | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [setupId, setSetupId] = useState<string | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<
    { sigla: string; descricao: string }[]
  >([]);
  const [totpCode, setTotpCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting2fa, setSubmitting2fa] = useState(false);
  const [preferredProfile, setPreferredProfile] = useState("MS018312 ADVOGADO");
  const [manualCpf, setManualCpf] = useState("");
  const [manualKeyword, setManualKeyword] = useState("");
  const [queryRuns, setQueryRuns] = useState("1");

  const [runResult, setRunResult] = useState<EprocConsultationResult | null>(null);
  const [jobStatus, setJobStatus] = useState<EprocQueryJobStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [cancellingJob, setCancellingJob] = useState(false);
  const totpDigits = totpCode.replace(/\D/g, "").slice(0, 6);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopJobPolling = useCallback(() => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const s = await juridicoApi.eproc.getSession();
      setSessionStatus(s);
    } catch {
      setSessionStatus({ status: "none" });
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    return () => {
      stopPolling();
      stopJobPolling();
    };
  }, [loadSession, stopPolling, stopJobPolling]);

  const pollQueryJob = useCallback(
    (jobId: string) => {
      stopJobPolling();
      const syncJob = async () => {
        try {
          const status = await juridicoApi.eproc.getQueryJob(jobId);
          setJobStatus(status);
          setRunResult({
            jobId: status.jobId,
            status: status.status,
            total: status.total,
            completed: status.successCount,
            failed: status.errorCount,
            processesReceived: status.processesReceived,
            processesPersisted: status.processesPersisted,
            processesFiltered: status.processesFiltered,
          });
          if (["completed", "failed", "cancelled"].includes(status.status)) {
            stopJobPolling();
            setRunning(false);
          }
        } catch (e: unknown) {
          setErrorMsg(e instanceof Error ? e.message : "Erro ao atualizar status da fila eProc");
          stopJobPolling();
          setRunning(false);
        }
      };
      syncJob();
      jobPollRef.current = setInterval(syncJob, 5000);
    },
    [stopJobPolling],
  );

  const pollSetupStatus = useCallback(
    (id: string, options: { stopOnWaiting2fa?: boolean } = {}) => {
      stopPolling();

      const syncStatus = async () => {
        try {
          const s: EprocSetupStatus = await juridicoApi.eproc.getSetupStatus(id);
          if (s.phase === "waiting_2fa") {
            if (options.stopOnWaiting2fa !== false) {
              setPhase("waiting_2fa");
              stopPolling();
            }
          } else if (s.phase === "waiting_profile") {
            setPhase("waiting_profile");
            setAvailableProfiles(s.availableProfiles ?? []);
            stopPolling();
          } else if (s.phase === "completed") {
            setPhase("completed");
            stopPolling();
            loadSession();
          } else if (s.phase === "failed") {
            setPhase("failed");
            setErrorMsg(s.errorMessage ?? "Erro desconhecido");
            stopPolling();
          }
        } catch (e: unknown) {
          setPhase("failed");
          setErrorMsg(e instanceof Error ? e.message : "Erro ao consultar status do setup eProc");
          stopPolling();
        }
      };

      void syncStatus();
      pollRef.current = setInterval(syncStatus, 3000);
    },
    [stopPolling, loadSession]
  );

  const handleStartSetup = async () => {
    setPhase("starting");
    setErrorMsg(null);
    setTotpCode("");
    try {
      const { setupId: id } = await juridicoApi.eproc.startSetup(preferredProfile.trim());
      setSetupId(id);
      pollSetupStatus(id, { stopOnWaiting2fa: true });
    } catch (e: unknown) {
      setPhase("failed");
      setErrorMsg(e instanceof Error ? e.message : "Erro ao iniciar setup");
    }
  };

  const handleSubmit2FA = async () => {
    if (!setupId) {
      setErrorMsg("Setup eProc não encontrado. Inicie a sessão novamente.");
      return;
    }
    if (totpDigits.length !== 6) {
      setErrorMsg("Informe o código 2FA com 6 dígitos.");
      return;
    }
    setSubmitting2fa(true);
    setErrorMsg(null);
    try {
      setPhase("starting");
      await juridicoApi.eproc.submit2fa(setupId, totpDigits);
      pollSetupStatus(setupId, { stopOnWaiting2fa: false });
    } catch (e: unknown) {
      setPhase("waiting_2fa");
      setErrorMsg(e instanceof Error ? e.message : "Erro ao enviar código 2FA");
    } finally {
      setSubmitting2fa(false);
    }
  };

  const handleSelectProfile = async (sigla: string) => {
    if (!setupId) return;
    try {
      await juridicoApi.eproc.selectProfile(setupId, sigla);
      setPhase("saving");
      pollSetupStatus(setupId);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao selecionar perfil");
    }
  };

  const handleRunConsultations = async () => {
    setRunning(true);
    setCancellingJob(false);
    setRunResult(null);
    setErrorMsg(null);
    try {
      const result = await juridicoApi.eproc.runConsultations({
        cpf: manualCpf.replace(/\D/g, "") || undefined,
        keyword: manualKeyword.trim() || undefined,
        queryRuns: Math.max(1, Number(queryRuns) || 1),
      });
      setRunResult(result);
      setJobStatus(null);
      if (result.jobId && result.total > 0) {
        pollQueryJob(result.jobId);
      } else {
        setRunning(false);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao executar consultas");
      setRunning(false);
    }
  };

  const handleCancelQueryJob = async () => {
    const jobId = jobStatus?.jobId ?? runResult?.jobId;
    if (!jobId) {
      setErrorMsg("Nenhuma fila em processamento foi encontrada para cancelamento.");
      return;
    }

    setCancellingJob(true);
    setErrorMsg(null);
    try {
      const status = await juridicoApi.eproc.cancelQueryJob(jobId);
      stopJobPolling();
      setJobStatus(status);
      setRunResult({
        jobId: status.jobId,
        status: status.status,
        total: status.total,
        completed: status.successCount,
        failed: status.errorCount,
        processesReceived: status.processesReceived,
        processesPersisted: status.processesPersisted,
        processesFiltered: status.processesFiltered,
      });
      setRunning(false);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao cancelar processamento");
    } finally {
      setCancellingJob(false);
    }
  };

  const renderActiveSessionControls = () => (
    <div className="mb-3">
      <p className="text-muted mb-1">
        Sessão salva em{" "}
        {sessionStatus?.createdAt
          ? new Date(sessionStatus.createdAt).toLocaleString("pt-BR")
          : "—"}
      </p>
      <div className="d-flex gap-2 flex-wrap">
        <Button
          color="primary"
          size="sm"
          onClick={handleRunConsultations}
          disabled={running || (manualCpf.length > 0 && manualCpf.length < 11)}
        >
          {running ? <Spinner size="sm" className="me-1" /> : null}
          {running ? "Processando fila..." : "Executar consultas pendentes"}
        </Button>
        <Button color="outline-secondary" size="sm" onClick={handleStartSetup}>
          Renovar sessão
        </Button>
        {running && (
          <Button
            color="danger"
            outline
            size="sm"
            onClick={handleCancelQueryJob}
            disabled={cancellingJob}
          >
            {cancellingJob ? <Spinner size="sm" className="me-1" /> : null}
            {cancellingJob ? "Cancelando..." : "Cancelar processamento"}
          </Button>
        )}
      </div>
      <div className="row g-2 mt-3">
        <div className="col-md-4">
          <label className="form-label small text-muted" htmlFor="eproc-manual-cpf">
            CPF específico
          </label>
          <Input
            id="eproc-manual-cpf"
            type="text"
            value={manualCpf}
            onChange={(e) => setManualCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="Opcional"
            disabled={running}
          />
        </div>
        <div className="col-md-5">
          <label className="form-label small text-muted" htmlFor="eproc-manual-keyword">
            Termo de busca
          </label>
          <Input
            id="eproc-manual-keyword"
            type="text"
            value={manualKeyword}
            onChange={(e) => setManualKeyword(e.target.value)}
            placeholder="Opcional"
            disabled={running}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label small text-muted" htmlFor="eproc-query-runs">
            Qtde Consultas
          </label>
          <Input
            id="eproc-query-runs"
            type="number"
            min={1}
            max={250}
            step={1}
            value={queryRuns}
            onChange={(e) => setQueryRuns(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="1"
            disabled={running}
          />
        </div>
      </div>
      <div className="mt-3" style={{ maxWidth: 320 }}>
        <label className="form-label small text-muted" htmlFor="eproc-preferred-profile-active">
          Perfil eProc
        </label>
        <Input
          id="eproc-preferred-profile-active"
          type="text"
          value={preferredProfile}
          onChange={(e) => setPreferredProfile(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Sessão eProc</h5>
        {!loadingSession && (
          <Badge color={sessionStatus?.status === "active" ? "success" : "secondary"}>
            {sessionStatus?.status === "active" ? "Ativa" : "Não configurada"}
          </Badge>
        )}
      </CardHeader>
      <CardBody>
        {loadingSession && <Spinner size="sm" />}

        {!loadingSession && phase === "idle" && (
          <>
            {sessionStatus?.status === "active" ? (
              renderActiveSessionControls()
            ) : (
              <div>
                <p className="text-muted mb-3">
                  Configure as credenciais do eProc e clique em Iniciar para autenticar.
                  O processo requer código 2FA do app autenticador.
                </p>
                <div className="mb-3" style={{ maxWidth: 320 }}>
                  <label className="form-label small text-muted" htmlFor="eproc-preferred-profile">
                    Perfil eProc
                  </label>
                  <Input
                    id="eproc-preferred-profile"
                    type="text"
                    value={preferredProfile}
                    onChange={(e) => setPreferredProfile(e.target.value)}
                  />
                </div>
                <Button color="primary" onClick={handleStartSetup}>
                  Iniciar sessão eProc
                </Button>
              </div>
            )}
          </>
        )}

        {phase === "starting" && (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner size="sm" />
            Conectando ao eProc...
          </div>
        )}

        {phase === "waiting_2fa" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit2FA();
            }}
          >
            <p className="fw-semibold mb-2">Código 2FA</p>
            <p className="text-muted mb-3">
              Abra seu app autenticador e insira o código de 6 dígitos do eProc.
            </p>
            <div className="d-flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={totpDigits}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                style={{ width: 120 }}
                autoFocus
              />
              <Button color="primary" type="submit" disabled={totpDigits.length !== 6 || submitting2fa}>
                {submitting2fa ? <Spinner size="sm" className="me-1" /> : null}
                {submitting2fa ? "Enviando..." : "Confirmar"}
              </Button>
            </div>
            {errorMsg && (
              <Alert color="danger" className="mt-3 mb-0">
                {errorMsg}
              </Alert>
            )}
          </form>
        )}

        {phase === "waiting_profile" && (
          <div>
            <p className="fw-semibold mb-2">Selecione o perfil</p>
            {availableProfiles.length === 0 ? (
              <Alert color="warning" className="mb-0">
                O eProc solicitou seleção de perfil, mas nenhum perfil foi retornado para seleção.
              </Alert>
            ) : (
              <div className="list-group" style={{ maxWidth: 360 }}>
                {availableProfiles.map((p) => (
                  <button
                    key={p.sigla}
                    className="list-group-item list-group-item-action"
                    onClick={() => handleSelectProfile(p.sigla)}
                  >
                    <span className="fw-medium me-2">{p.sigla}</span>
                    <span className="text-muted">{p.descricao}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "saving" && (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner size="sm" />
            Salvando sessão...
          </div>
        )}

        {phase === "completed" && (
          <>
            <Alert color="success" className="mb-3">
              Sessão configurada com sucesso! O robô já pode executar consultas.
            </Alert>
            {renderActiveSessionControls()}
          </>
        )}

        {phase === "failed" && (
          <div>
            <Alert color="danger" className="mb-3">
              {errorMsg ?? "Falha ao configurar sessão"}
            </Alert>
            <Button color="outline-secondary" size="sm" onClick={() => setPhase("idle")}>
              Tentar novamente
            </Button>
          </div>
        )}

        {runResult && (
          <Alert
            color={runResult.total === 0 ? "info" : runResult.status === "failed" || runResult.failed > 0 ? "warning" : "success"}
            className="mt-3 mb-0"
          >
            {runResult.total === 0
              ? "Nenhuma consulta pendente para executar no eProc."
              : `Fila ${runResult.status ?? "queued"}: ${runResult.completed} concluídas, ${runResult.failed} com erro, ${runResult.total} no total. Processos: ${runResult.processesPersisted} gravados, ${runResult.processesFiltered} filtrados, ${runResult.processesReceived} recebidos.${jobStatus?.lastError ? ` Último erro: ${jobStatus.lastError}` : ""}`}
          </Alert>
        )}

        {errorMsg && phase === "idle" && (
          <Alert color="danger" className="mt-3 mb-0">
            {errorMsg}
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}
