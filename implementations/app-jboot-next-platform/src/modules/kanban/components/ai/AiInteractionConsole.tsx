"use client";

import React, { useState } from "react";
import { Alert, Button, Form, Input, Label, Spinner } from "reactstrap";
import { AiAgent, AiInteraction, aiGatewayApi } from "@/lib/ai-gateway-api";

type Props = { agent: AiAgent };

export default function AiInteractionConsole({ agent }: Props) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AiInteraction | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await aiGatewayApi.interactions.create(agent.id, {
          message: message.trim(),
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Falha ao executar o agente",
      );
    } finally {
      setSending(false);
    }
  };

  const renderedOutput =
    typeof result?.output === "string"
      ? result.output
      : result?.output == null
        ? ""
        : JSON.stringify(result.output, null, 2);

  return (
    <Form onSubmit={submit}>
      <div className="mb-3">
        <div className="d-flex justify-content-between gap-3 mb-2">
          <strong>{agent.name}</strong>
          <span className="text-muted small">
            {agent.provider} / {agent.model} / v{agent.activeVersion}
          </span>
        </div>
        <Label htmlFor="ai-interaction-message">Solicitação</Label>
        <Input
          id="ai-interaction-message"
          type="textarea"
          rows={6}
          maxLength={60000}
          value={message}
          disabled={sending}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Informe o que o agente deve analisar ou responder."
        />
      </div>

      {error && <Alert color="danger">{error}</Alert>}
      {result?.replayed && !result.outputAvailable && (
        <Alert color="warning">
          Esta solicitação já foi processada. O conteúdo não foi retido e não
          será cobrado novamente.
        </Alert>
      )}
      {result?.status === "failed" && (
        <Alert color="danger">
          Execução recusada: {result.errorCode ?? "ai_execution_failed"}
        </Alert>
      )}
      {result?.status === "succeeded" && result.outputAvailable && (
        <div className="border rounded p-3 bg-light mb-3">
          <div className="d-flex justify-content-between gap-3 mb-2">
            <strong>Resposta</strong>
            <span className="text-muted small">
              {result.inputTokens ?? "—"} entrada · {result.outputTokens ?? "—"}
              saída · {result.latencyMs ?? "—"} ms
            </span>
          </div>
          <pre className="mb-0 text-wrap" style={{ whiteSpace: "pre-wrap" }}>
            {renderedOutput}
          </pre>
        </div>
      )}

      <div className="d-flex justify-content-end">
        <Button
          type="submit"
          color="primary"
          disabled={sending || !message.trim()}
        >
          {sending && <Spinner size="sm" className="me-2" />}
          Enviar
        </Button>
      </div>
    </Form>
  );
}
