"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Col,
  Container,
  Row,
  Spinner,
} from "reactstrap";
import NonAuthLayout from "@/layouts/Layouts/NonAuthLayout";
import {
  getKanbanAuthToken,
  KanbanApiError,
} from "@/modules/kanban/lib/kanban-api";
import {
  CLAUDE_CONNECTOR_SCOPE_LABELS,
  ClaudeAuthorizationRequestDto,
  claudeConnectorOAuthApi,
} from "@/modules/kanban/lib/claude-connector-oauth-api";

const DEFAULT_IDENTITY_LOGIN_URL = "http://localhost:3000/login";

/** Login do Identity que volta para este consentimento depois de escolher o Flow. */
function loginUrl(): string {
  const url = new URL(
    "/login",
    process.env.NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL ??
      DEFAULT_IDENTITY_LOGIN_URL,
  );
  url.searchParams.set("returnTo", window.location.href);
  return url.toString();
}

type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | { kind: "ready"; request: ClaudeAuthorizationRequestDto };

/**
 * Consentimento OAuth do conector Claude. O app que pede acesso e
 * identificado pelo host da URL do client_id (o nome e autodeclarado); para
 * retorno em loopback (Claude Code), alerta extra, como pede a especificacao
 * MCP de autorizacao.
 */
export default function ClaudeConsentPage() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    if (!requestId) {
      setState({ kind: "expired" });
      return;
    }
    if (!getKanbanAuthToken()) {
      setState({ kind: "login" });
      return;
    }
    claudeConnectorOAuthApi
      .getAuthorizationRequest(requestId)
      .then((request) => setState({ kind: "ready", request }))
      .catch((cause: unknown) => {
        if (
          cause instanceof KanbanApiError &&
          (cause.status === 404 || cause.status === 410 || cause.status === 400)
        ) {
          setState({ kind: "expired" });
        } else if (
          cause instanceof KanbanApiError &&
          (cause.status === 401 || cause.status === 403)
        ) {
          setState({ kind: "login" });
        } else {
          setState({
            kind: "error",
            message: "Não foi possível carregar o pedido de autorização.",
          });
        }
      });
  }, [requestId]);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    try {
      const { redirectUrl } = await claudeConnectorOAuthApi.decide(
        requestId,
        approve,
      );
      window.location.assign(redirectUrl);
    } catch (cause) {
      setBusy(null);
      if (cause instanceof KanbanApiError && cause.status === 410)
        setState({ kind: "expired" });
      else
        setState({
          kind: "error",
          message:
            "Não foi possível registrar a sua decisão. Tente conectar de novo pelo Claude.",
        });
    }
  }

  // NonAuthLayout aplica tema/modo do preset (data-theme, data-bs-theme) fora do layout com menu.
  return (
    <NonAuthLayout>
      <div className="auth-page-wrapper pt-5">
        <div className="auth-page-content">
          <Container>
            <Row className="justify-content-center">
              <Col md={8} lg={6} xl={5}>
                <Card className="mt-4">
                  <CardBody className="p-4">
                    <div className="text-center mb-4">
                      <i className="ri-plug-line display-6 text-primary" />
                      <h5 className="text-primary mt-2">
                        Conectar o Claude ao Flow
                      </h5>
                    </div>
                    {renderBody()}
                  </CardBody>
                </Card>
              </Col>
            </Row>
          </Container>
        </div>
      </div>
    </NonAuthLayout>
  );

  function renderBody() {
    if (state.kind === "loading")
      return (
        <div className="text-center py-4">
          <Spinner color="primary" />
        </div>
      );
    if (state.kind === "login") {
      return (
        <>
          <p className="text-muted">
            Entre no JBoot e selecione o <strong>Flow</strong> da empresa que o
            Claude vai acessar. Depois você volta para esta tela.
          </p>
          <Button
            color="primary"
            className="w-100"
            onClick={() => window.location.assign(loginUrl())}
          >
            Entrar no JBoot
          </Button>
        </>
      );
    }
    if (state.kind === "expired") {
      return (
        <Alert color="warning" className="mb-0">
          Este pedido expirou ou já foi usado. Volte ao Claude e conecte de
          novo.
        </Alert>
      );
    }
    if (state.kind === "error") {
      return (
        <Alert color="danger" className="mb-0">
          {state.message}
        </Alert>
      );
    }
    const request = state.request;
    return (
      <>
        <p className="mb-2">
          <strong>{request.clientHost}</strong> ({request.clientName}) pede
          acesso ao Flow de <strong>{request.tenantName}</strong> em seu nome:
        </p>
        <ul className="mb-3">
          {request.scopes.map((scope) => (
            <li key={scope}>{CLAUDE_CONNECTOR_SCOPE_LABELS[scope] ?? scope}</li>
          ))}
        </ul>
        <p className="text-muted small mb-3">
          A autorização volta para{" "}
          <strong className="font-monospace">{request.redirectHost}</strong>. O
          conteúdo lido vai para a sua conta Claude. Você pode revogar a
          qualquer momento em Flow → Configurações → IA → Conector Claude.
        </p>
        {request.loopbackRedirect && (
          <Alert color="warning" className="small" fade={false}>
            <i className="ri-error-warning-line me-1" />O retorno vai para um
            programa no seu próprio computador. Só autorize se você acabou de
            iniciar esta conexão no Claude Code.
          </Alert>
        )}
        <div className="d-flex gap-2">
          <Button
            color="light"
            className="w-50"
            onClick={() => void decide(false)}
            disabled={busy !== null}
          >
            {busy === "deny" ? <Spinner size="sm" /> : "Recusar"}
          </Button>
          <Button
            color="primary"
            className="w-50"
            onClick={() => void decide(true)}
            disabled={busy !== null}
          >
            {busy === "approve" ? <Spinner size="sm" /> : "Autorizar"}
          </Button>
        </div>
      </>
    );
  }
}
