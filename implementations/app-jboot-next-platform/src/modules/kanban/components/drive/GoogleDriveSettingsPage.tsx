"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Input, Label, Spinner } from "reactstrap";
import { DriveConfigurationDto, KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { pickDriveFolder } from "./google-picker";

const DRIVE_ERRORS: Record<string, string> = {
  drive_oauth_not_configured: "A integração com o Google Drive ainda não está disponível neste ambiente.",
  drive_permission_denied: "Marque a permissão de acesso ao Google Drive na tela do Google e tente novamente.",
  drive_state_invalid: "A autorização expirou. Clique em conectar novamente.",
  drive_code_invalid: "Não foi possível concluir a autorização do Google. Tente conectar novamente.",
  drive_oauth_invalid: "A conexão com o Google expirou ou foi revogada. Conecte novamente.",
  drive_folder_unavailable: "Não foi possível acessar a pasta escolhida. Escolha outra pasta.",
  drive_folder_invalid: "O item escolhido não é uma pasta do Drive.",
  drive_folder_required: "Escolha a pasta de destino antes de ativar o envio.",
  drive_not_connected: "Conecte sua conta Google primeiro.",
};

function driveError(cause: unknown, fallback: string) {
  if (cause instanceof KanbanApiError && cause.code && DRIVE_ERRORS[cause.code]) return DRIVE_ERRORS[cause.code];
  return describeKanbanError(cause, fallback);
}

function redirectUri() {
  return `${window.location.origin}/flow/configuracoes/google-drive`;
}

export default function GoogleDriveSettingsPage() {
  const [configuration, setConfiguration] = useState<DriveConfigurationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const handledCallback = useRef(false);

  const load = useCallback(async () => {
    try {
      setConfiguration(await kanbanApi.drive.getConfiguration());
    } catch (cause) {
      if (cause instanceof KanbanApiError && cause.status === 403) setForbidden(true);
      else setError(driveError(cause, "Erro ao carregar a configuração do Google Drive"));
    }
  }, []);

  useEffect(() => {
    // Retorno do consentimento do Google: ?code=...&state=... (ou ?error=access_denied).
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");
    if ((code || denied) && !handledCallback.current) {
      handledCallback.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      if (code && state) {
        void (async () => {
          try {
            setConfiguration(await kanbanApi.drive.completeConnect({ code, state, redirectUri: redirectUri() }));
          } catch (cause) {
            if (cause instanceof KanbanApiError && cause.status === 403) setForbidden(true);
            else setError(driveError(cause, "Não foi possível conectar a conta Google"));
            await load();
          } finally {
            setLoading(false);
          }
        })();
        return;
      }
      setError(DRIVE_ERRORS.drive_permission_denied);
    }
    void load().finally(() => setLoading(false));
  }, [load]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(driveError(cause, fallback));
      await load();
    } finally {
      setBusy(false);
    }
  }

  const connect = () => run(async () => {
    const { authorizationUrl } = await kanbanApi.drive.startConnect(redirectUri());
    window.location.assign(authorizationUrl);
  }, "Não foi possível iniciar a conexão com o Google");

  const disconnect = () => run(async () => {
    setConfiguration(await kanbanApi.drive.disconnect());
  }, "Erro ao desconectar a conta Google");

  const chooseFolder = () => run(async () => {
    const credentials = await kanbanApi.drive.pickerToken();
    const folder = await pickDriveFolder(credentials);
    if (!folder) return;
    setConfiguration(await kanbanApi.drive.saveConfiguration({
      rootFolderId: folder.id,
      enabled: configuration?.status === "active",
    }));
  }, "Erro ao escolher a pasta");

  const toggle = (enabled: boolean) => run(async () => {
    setConfiguration(await kanbanApi.drive.saveConfiguration({ enabled }));
  }, "Erro ao salvar a configuração");

  if (loading) return <div className="text-center py-5"><Spinner color="primary" /></div>;
  if (forbidden) return <Alert color="warning"><i className="ri-lock-line me-2" />Você não possui permissão para administrar esta integração.</Alert>;

  const connected = configuration?.connected ?? false;
  const invalid = configuration?.status === "invalid";
  const hasFolder = Boolean(configuration?.rootFolderId);

  return (
    <>
      <div className="mb-3">
        <h4 className="mb-1">Google Drive</h4>
        <p className="text-muted mb-0">Envie uma cópia dos documentos para uma pasta do seu Google Drive.</p>
      </div>

      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      {invalid && <Alert color="warning">{DRIVE_ERRORS.drive_oauth_invalid}</Alert>}

      <Card>
        <CardHeader><h5 className="mb-0"><i className="ri-google-fill me-2" />Conexão</h5></CardHeader>
        <CardBody>
          <div className="mb-4">
            <Label className="d-block">Conta Google</Label>
            {connected && !invalid ? (
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span><i className="ri-checkbox-circle-line text-success me-1" />{configuration?.accountEmail ?? "Conta conectada"}</span>
                <Button color="link" className="p-0" onClick={() => void disconnect()} disabled={busy}>Desconectar</Button>
              </div>
            ) : (
              <Button color="primary" onClick={() => void connect()} disabled={busy}>
                {busy ? <Spinner size="sm" /> : <><i className="ri-google-fill me-1" />{invalid ? "Reconectar" : "Conectar conta Google"}</>}
              </Button>
            )}
          </div>

          <div className="mb-4">
            <Label className="d-block">Pasta de destino</Label>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className={hasFolder ? "" : "text-muted"}>
                <i className="ri-folder-line me-1" />{hasFolder ? configuration?.rootFolderName || "Pasta escolhida" : "Nenhuma pasta escolhida"}
              </span>
              <Button color="light" size="sm" onClick={() => void chooseFolder()} disabled={busy || !connected || invalid}>
                {hasFolder ? "Alterar pasta" : "Escolher pasta"}
              </Button>
            </div>
          </div>

          <div className="form-check form-switch form-switch-lg">
            <Input
              id="drive-enabled"
              type="switch"
              role="switch"
              checked={configuration?.status === "active"}
              disabled={busy || !connected || invalid || !hasFolder}
              onChange={(event) => void toggle(event.target.checked)}
            />
            <Label for="drive-enabled" className="form-check-label">Enviar documentos para o Google Drive</Label>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
