"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, Label, Spinner } from "reactstrap";
import AuthCardShell from "@/components/auth/AuthCardShell";
import { formatCpfCnpj, onlyDigits } from "@/lib/document-mask";
import { requestPasswordReset } from "@/lib/jboot-identity";

/**
 * Pedido de redefinicao: a pessoa informa o documento com que entra (CPF ou CNPJ do login). A
 * resposta e sempre a mesma, para nao revelar quem tem cadastro nem qual e o e-mail.
 */
export default function ForgotPassword() {
  const [document, setDocument] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const complete = document.length === 11 || document.length === 14;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!complete || sending) return;
    setSending(true);
    setError("");
    try {
      await requestPasswordReset(document);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o pedido");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthCardShell
      title="Esqueci minha senha"
      subtitle={
        sent ? undefined : "Informe o CPF ou CNPJ que você usa para entrar."
      }
    >
      {sent ? (
        <>
          <Alert color="success">
            Se houver cadastro com este documento, enviamos um link para o
            e-mail vinculado. O link vale por 1 hora.
          </Alert>
          <p className="text-muted small">
            Não recebeu? Confira a caixa de spam ou peça ao administrador da sua
            empresa para conferir o seu e-mail.
          </p>
          <Link href="/login" className="btn btn-success w-100">
            Voltar ao login
          </Link>
        </>
      ) : (
        <Form onSubmit={handleSubmit}>
          {error ? <Alert color="danger">{error}</Alert> : null}
          <div className="mb-3">
            <Label className="form-label" htmlFor="reset-document">
              CPF/CNPJ
            </Label>
            <Input
              id="reset-document"
              inputMode="numeric"
              autoComplete="username"
              placeholder="000.000.000-00"
              value={formatCpfCnpj(document)}
              onChange={event => setDocument(onlyDigits(event.target.value))}
            />
          </div>
          <Button
            color="success"
            className="w-100"
            type="submit"
            disabled={!complete || sending}
          >
            {sending ? <Spinner size="sm" className="me-2" /> : null}
            Enviar link
          </Button>
          <div className="text-center mt-3">
            <Link href="/login" className="text-muted">
              Voltar ao login
            </Link>
          </div>
        </Form>
      )}
    </AuthCardShell>
  );
}
