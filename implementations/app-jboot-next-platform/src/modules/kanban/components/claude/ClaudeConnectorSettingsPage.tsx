"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Input, Label, Row, Spinner, Table } from "reactstrap";
import { ClaudeConnectorSettingsDto, KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import {
  CLAUDE_CONNECTOR_SCOPE_LABELS,
  ClaudeConnectionDto,
  claudeConnectorOAuthApi,
} from "@/modules/kanban/lib/claude-connector-oauth-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/**
 * Configuracoes -> IA -> Conector Claude. Todo usuario do Flow ve como
 * conectar e gerencia as proprias conexoes; so `flow:admin` liga o conector
 * para a empresa e decide o mascaramento de dados pessoais.
 */
export default function ClaudeConnectorSettingsPage() {
  const [settings, setSettings] = useState<ClaudeConnectorSettingsDto | null>(null);
  const [connections, setConnections] = useState<ClaudeConnectionDto[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [maskPersonalData, setMaskPersonalData] = useState(true);
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [allowCustomerDocuments, setAllowCustomerDocuments] = useState(false);
  const [acceptDocumentsPolicy, setAcceptDocumentsPolicy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setForbidden(false);
    try {
      const [result, grants] = await Promise.all([
        kanbanApi.claudeConnector.getSettings(),
        claudeConnectorOAuthApi.listConnections(),
      ]);
      setSettings(result);
      setEnabled(result.enabled);
      setMaskPersonalData(result.maskPersonalData);
      setAllowCustomerDocuments(result.allowCustomerDocuments);
      setConnections(grants.data);
    } catch (cause) {
      if (cause instanceof KanbanApiError && cause.status === 403) setForbidden(true);
      else setError(describeKanbanError(cause, "Erro ao carregar o conector Claude"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (enabled && !settings?.policyAcceptedAt && !acceptPolicy) {
      setError("Para ligar o conector, confirme a ciência sobre o envio de dados ao Claude.");
      return;
    }
    if (allowCustomerDocuments && !settings?.customerDocumentsAcceptedAt && !acceptDocumentsPolicy) {
      setError("Para liberar a leitura de documentos, confirme a ciência sobre o envio de documentos pessoais ao Claude.");
      return;
    }
    setBusy("save");
    setError(null);
    setSuccess(null);
    try {
      const result = await kanbanApi.claudeConnector.saveSettings({
        enabled,
        maskPersonalData,
        ...(acceptPolicy ? { acceptPolicy: true } : {}),
        allowCustomerDocuments,
        ...(acceptDocumentsPolicy ? { acceptCustomerDocumentsPolicy: true } : {}),
      });
      setSettings(result);
      setAcceptPolicy(false);
      setAcceptDocumentsPolicy(false);
      setSuccess(result.enabled ? "Conector ligado para a empresa." : "Conector desligado para a empresa.");
    } catch (cause) {
      setError(describeKanbanError(cause, "Erro ao salvar o conector Claude"));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(connection: ClaudeConnectionDto) {
    setBusy(connection.id);
    setError(null);
    setSuccess(null);
    try {
      await claudeConnectorOAuthApi.revokeConnection(connection.id);
      setConnections((current) => current.filter((item) => item.id !== connection.id));
      setSuccess(`Conexão "${connection.clientName}" revogada. O Claude perde o acesso na próxima chamada.`);
    } catch (cause) {
      setError(describeKanbanError(cause, "Erro ao revogar a conexão"));
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!settings) return;
    try {
      await navigator.clipboard.writeText(settings.connectorUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione a URL e copie manualmente.");
    }
  }

  if (loading) return <div className="text-center py-5"><Spinner color="primary" /></div>;
  if (forbidden) return <Alert color="warning"><i className="ri-lock-line me-2" />Você não possui acesso ao Flow nesta empresa.</Alert>;
  if (!settings) {
    return (
      <Alert color="danger">
        {error ?? "Erro ao carregar o conector Claude"}{" "}
        <Button color="link" className="p-0 ms-1" onClick={() => void load()}>Tentar novamente</Button>
      </Alert>
    );
  }

  const disabled = busy !== null;
  const dirty =
    enabled !== settings.enabled ||
    maskPersonalData !== settings.maskPersonalData ||
    allowCustomerDocuments !== settings.allowCustomerDocuments;
  const needsPolicy = enabled && !settings.policyAcceptedAt;
  const needsDocumentsPolicy = allowCustomerDocuments && !settings.customerDocumentsAcceptedAt;

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">Conector Claude</h4>
          <p className="text-muted mb-0">Use a sua assinatura Claude com o Flow: você conversa no Claude, e o Claude lê os cards e registra o resultado aqui.</p>
        </div>
        <Badge color={settings.enabled ? "success" : "secondary"} className="fs-6 px-3 py-2">
          <i className={`${settings.enabled ? "ri-checkbox-circle-line" : "ri-pause-circle-line"} me-1`} />
          {settings.enabled ? "Ligado" : "Desligado"}
        </Badge>
      </div>

      {error && <Alert color="danger" toggle={() => setError(null)}>{error} <Button color="link" className="p-0 ms-1" onClick={() => void load()}>Tentar novamente</Button></Alert>}
      {success && <Alert color="success" toggle={() => setSuccess(null)}>{success}</Alert>}
      {!settings.enabled && (
        <Alert color="warning">
          <i className="ri-information-line me-2" />
          {settings.canManage
            ? "O conector está desligado para a empresa. Ligue-o abaixo para que os usuários possam usá-lo."
            : "O conector está desligado para a empresa. Peça ao gestor do Flow para ligá-lo."}
        </Alert>
      )}

      <Row className="g-3">
        <Col xl={7}>
          <Card className="h-100">
            <CardHeader><h5 className="mb-0"><i className="ri-plug-line me-2" />Como conectar</h5></CardHeader>
            <CardBody>
              <Label for="claude-connector-url">URL do conector</Label>
              <div className="d-flex gap-2 mb-3">
                <Input id="claude-connector-url" value={settings.connectorUrl} readOnly className="font-monospace" onFocus={(event) => event.target.select()} />
                <Button color="light" onClick={() => void copyUrl()}><i className={`${copied ? "ri-check-line" : "ri-file-copy-line"} me-1`} />{copied ? "Copiado" : "Copiar"}</Button>
              </div>
              <ol className="ps-3 mb-3">
                <li>No Claude (site, app ou celular), abra <strong>Configurações → Conectores</strong> e escolha <strong>Adicionar conector personalizado</strong>.</li>
                <li>Cole a URL acima e confirme.</li>
                <li>Clique em <strong>Conectar</strong>: o JBoot abre para você entrar e autorizar.</li>
                <li>Na conversa, peça por exemplo: “resuma o card X do quadro Y e registre o parecer como comentário”.</li>
              </ol>
              <p className="text-muted small mb-1">No Claude Code:</p>
              <pre className="bg-light-subtle border rounded p-2 small mb-3"><code>{`claude mcp add --transport http jboot-flow ${settings.connectorUrl}`}</code></pre>
              <p className="text-muted small mb-0">
                O uso sai da sua assinatura Claude. O Claude só vê o que você já vê no Flow e só pode comentar em cards; mover, editar ou aprovar continua sendo feito aqui.
              </p>
            </CardBody>
          </Card>
        </Col>

        {settings.canManage && (
          <Col xl={5}>
            <Card className="h-100">
              <CardHeader><h5 className="mb-0"><i className="ri-shield-check-line me-2" />Política da empresa</h5></CardHeader>
              <CardBody>
                <div className="form-check form-switch mb-3">
                  <Input id="claude-connector-enabled" type="switch" className="form-check-input" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={disabled} />
                  <Label for="claude-connector-enabled" className="form-check-label">Permitir o conector Claude nesta empresa</Label>
                </div>
                <div className="form-check form-switch mb-3">
                  <Input id="claude-connector-mask" type="switch" className="form-check-input" checked={maskPersonalData} onChange={(event) => setMaskPersonalData(event.target.checked)} disabled={disabled} />
                  <Label for="claude-connector-mask" className="form-check-label">Ocultar CPF, CNPJ, e-mail e telefone no que o Claude lê</Label>
                  <div className="form-text">Nomes e endereços não são detectados automaticamente.</div>
                </div>
                {needsPolicy && (
                  <Alert color="warning" className="mb-3">
                    <p className="small mb-2">
                      O conteúdo lido pelo Claude vai para a conta Claude de cada usuário conectado, sob os termos da Anthropic que valem para aquela conta.
                      Em contas pessoais (Free, Pro, Max), o uso desse conteúdo para treinamento depende da configuração de privacidade de cada usuário.
                    </p>
                    <div className="form-check mb-0">
                      <Input id="claude-connector-policy" type="checkbox" className="form-check-input" checked={acceptPolicy} onChange={(event) => setAcceptPolicy(event.target.checked)} disabled={disabled} />
                      <Label for="claude-connector-policy" className="form-check-label small">Estou ciente e autorizo o envio para as contas Claude dos usuários desta empresa.</Label>
                    </div>
                  </Alert>
                )}
                {settings.policyAcceptedAt && <p className="text-muted small">Ciência registrada em {formatDate(settings.policyAcceptedAt)}.</p>}
                <div className="form-check form-switch mb-3">
                  <Input id="claude-connector-documents" type="switch" className="form-check-input" checked={allowCustomerDocuments} onChange={(event) => setAllowCustomerDocuments(event.target.checked)} disabled={disabled} />
                  <Label for="claude-connector-documents" className="form-check-label">Permitir que o Claude leia os documentos da ficha do cliente</Label>
                  <div className="form-text">Usado pela validação de cadastro (contas Claude dos escritórios ou a principal) e pelas automações de coluna da conta principal, que leem os documentos de clientes já validados. O CPF não é ocultado nessa leitura.</div>
                </div>
                {needsDocumentsPolicy && (
                  <Alert color="warning" className="mb-3">
                    <p className="small mb-2">
                      RG, CNH, CPF, comprovante de residência e extrato do benefício vão para a conta Claude que executa a validação,
                      sob os termos da Anthropic que valem para aquela conta.
                    </p>
                    <div className="form-check mb-0">
                      <Input id="claude-connector-documents-policy" type="checkbox" className="form-check-input" checked={acceptDocumentsPolicy} onChange={(event) => setAcceptDocumentsPolicy(event.target.checked)} disabled={disabled} />
                      <Label for="claude-connector-documents-policy" className="form-check-label small">Estou ciente e autorizo o envio dos documentos pessoais dos clientes às contas Claude dos escritórios e da empresa.</Label>
                    </div>
                  </Alert>
                )}
                {settings.customerDocumentsAcceptedAt && <p className="text-muted small">Ciência sobre documentos registrada em {formatDate(settings.customerDocumentsAcceptedAt)}.</p>}
                <div className="d-flex justify-content-end">
                  <Button color="primary" onClick={() => void save()} disabled={disabled || !dirty || (needsPolicy && !acceptPolicy) || (needsDocumentsPolicy && !acceptDocumentsPolicy)}>
                    {busy === "save" ? <Spinner size="sm" className="me-1" /> : <i className="ri-save-line me-1" />}Salvar
                  </Button>
                </div>
              </CardBody>
            </Card>
          </Col>
        )}
      </Row>

      <Card className="mt-3">
        <CardHeader><h5 className="mb-0"><i className="ri-links-line me-2" />Minhas conexões</h5></CardHeader>
        <CardBody>
          {connections.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">Nenhuma conexão ativa. Conecte pelo Claude usando a URL acima.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap align-middle mb-0" hover>
                <thead className="table-light"><tr><th>Aplicativo</th><th>Permissões</th><th>Conectado em</th><th>Último uso</th><th className="text-end">Ações</th></tr></thead>
                <tbody>{connections.map((connection) => (
                  <tr key={connection.id}>
                    <td>{connection.clientName}</td>
                    <td className="text-wrap small">{connection.scopes.map((scope) => CLAUDE_CONNECTOR_SCOPE_LABELS[scope] ?? scope).join("; ")}</td>
                    <td>{formatDate(connection.createdAt)}</td>
                    <td>{formatDate(connection.lastUsedAt)}</td>
                    <td className="text-end">
                      <Button size="sm" color="danger" outline onClick={() => void revoke(connection)} disabled={disabled}>
                        {busy === connection.id ? <Spinner size="sm" /> : <><i className="ri-link-unlink-m me-1" />Revogar</>}
                      </Button>
                    </td>
                  </tr>
                ))}</tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
