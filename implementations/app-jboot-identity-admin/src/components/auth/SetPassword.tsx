"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Form,
  FormFeedback,
  Input,
  Label,
  Spinner,
} from "reactstrap";
import AuthCardShell from "@/components/auth/AuthCardShell";
import {
  AccessLinkInfo,
  checkAccessLink,
  setAccessPassword,
} from "@/lib/jboot-identity";

const MIN_PASSWORD = 8;

/**
 * Criar ou redefinir a senha pelo link do e-mail (convite ou "esqueci minha senha"). O link e de
 * uso unico; a tela confere antes de mostrar o formulario.
 */
export default function SetPassword() {
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<AccessLinkInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setError("Link incompleto. Abra o link do e-mail novamente.");
      setChecking(false);
      return;
    }
    checkAccessLink(token)
      .then(result => {
        if (active) setInfo(result);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Falha ao conferir o link"
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const canSave =
    password.length >= MIN_PASSWORD && confirmation === password && !saving;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await setAccessPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a senha");
    } finally {
      setSaving(false);
    }
  }

  const title =
    info?.purpose === "password_reset" ? "Redefinir senha" : "Criar senha";

  return (
    <AuthCardShell
      title={done ? "Senha salva" : title}
      subtitle={
        info && !done ? `${info.displayName} · login ${info.login}` : undefined
      }
    >
      {checking ? (
        <div className="text-center">
          <Spinner size="sm" />
        </div>
      ) : done ? (
        <>
          <Alert color="success">
            Pronto. Entre com o seu documento e a nova senha.
          </Alert>
          <Link href="/login" className="btn btn-success w-100">
            Ir para o login
          </Link>
        </>
      ) : !info ? (
        <>
          <Alert color="danger">{error}</Alert>
          <p className="text-muted small mb-3">
            Peça um novo link em &quot;Esqueci minha senha&quot; ou a quem fez o
            seu cadastro.
          </p>
          <Link href="/esqueci-senha" className="btn btn-soft-primary w-100">
            Esqueci minha senha
          </Link>
        </>
      ) : (
        <Form onSubmit={handleSubmit}>
          {error ? <Alert color="danger">{error}</Alert> : null}
          <div className="mb-3">
            <Label className="form-label" htmlFor="new-password">
              Nova senha
            </Label>
            <div className="position-relative auth-pass-inputgroup">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                className="form-control pe-5"
                autoComplete="new-password"
                value={password}
                invalid={tooShort}
                onChange={event => setPassword(event.target.value)}
              />
              <button
                className="btn btn-link position-absolute end-0 top-0 text-decoration-none text-muted"
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Mostrar senha"
              >
                <i className="ri-eye-fill align-middle" />
              </button>
              <FormFeedback>
                Use pelo menos {MIN_PASSWORD} caracteres.
              </FormFeedback>
            </div>
          </div>
          <div className="mb-3">
            <Label className="form-label" htmlFor="confirm-password">
              Repita a senha
            </Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirmation}
              invalid={mismatch}
              onChange={event => setConfirmation(event.target.value)}
            />
            <FormFeedback>As senhas não conferem.</FormFeedback>
          </div>
          <Button
            color="success"
            className="w-100 mt-2"
            type="submit"
            disabled={!canSave}
          >
            {saving ? <Spinner size="sm" className="me-2" /> : null}
            Salvar senha
          </Button>
        </Form>
      )}
    </AuthCardShell>
  );
}
