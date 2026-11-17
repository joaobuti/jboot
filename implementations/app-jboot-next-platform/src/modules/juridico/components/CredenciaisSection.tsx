"use client";

import React, { useCallback, useEffect, useState } from "react";
import { juridicoApi, CredencialStatus } from "@/modules/juridico/lib/juridico-api";

interface Props {
  portalSlug: string;
}

export default function CredenciaisSection({ portalSlug }: Props) {
  const [status, setStatus] = useState<CredencialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await juridicoApi.credenciais.get(portalSlug);
      setStatus(data);
      setEditing(!data.configured);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar credenciais");
    } finally {
      setLoading(false);
    }
  }, [portalSlug]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return;
    setSubmitting(true);
    setError(null);
    try {
      if (status.authType === "user_pass") {
        await juridicoApi.credenciais.set(portalSlug, { username, password });
      } else {
        await juridicoApi.credenciais.set(portalSlug, { token });
      }
      setUsername("");
      setPassword("");
      setToken("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar credencial");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await juridicoApi.credenciais.remove(portalSlug);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover credencial");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">
          <i className="ri-lock-line me-2" />
          Credenciais de Acesso
        </h5>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger py-2 mb-3" role="alert">
            <i className="ri-error-warning-line me-2" />
            {error}
          </div>
        )}

        {status.configured && !editing ? (
          <div>
            <div className="d-flex align-items-center mb-3">
              <span className="badge bg-success-subtle text-success me-2">
                <i className="ri-checkbox-circle-line me-1" />
                Credencial configurada
              </span>
              {status.updatedAt && (
                <small className="text-muted">
                  Atualizada em {new Date(status.updatedAt).toLocaleDateString("pt-BR")}
                </small>
              )}
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => setEditing(true)}
                disabled={submitting}
              >
                <i className="ri-edit-line me-1" />
                Alterar
              </button>
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => void handleRemove()}
                disabled={submitting}
              >
                {submitting ? (
                  <span className="spinner-border spinner-border-sm me-1" role="status" />
                ) : (
                  <i className="ri-delete-bin-line me-1" />
                )}
                Remover
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            {status.authType === "user_pass" && (
              <>
                <div className="mb-3">
                  <label className="form-label">Usuário</label>
                  <input
                    type="text"
                    className="form-control"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Senha</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            {status.authType === "token" && (
              <div className="mb-3">
                <label className="form-label">Token de Acesso</label>
                <input
                  type="password"
                  className="form-control"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                {submitting ? (
                  <span className="spinner-border spinner-border-sm me-1" role="status" />
                ) : (
                  <i className="ri-save-line me-1" />
                )}
                Salvar
              </button>
              {status.configured && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setEditing(false);
                    setUsername("");
                    setPassword("");
                    setToken("");
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
