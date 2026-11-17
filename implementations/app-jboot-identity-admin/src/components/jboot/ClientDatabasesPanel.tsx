"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Label, Spinner, Table } from "reactstrap";
import {
  adminApi,
  AdminClientDatabase,
  DATABASE_BLOCKED_LABELS,
  DATABASE_REF_STATUS_LABELS,
  ISOLATION_LABELS,
} from "@/lib/admin-api";

/**
 * Banco de cada modulo contratado do cliente, comparado com a regra atual do app
 * (docs/product/tenant-isolation-sprints.md, Sprint 0). "Aplicar regra atual" refaz o registro;
 * a edicao manual de banco/estrategia nao e exposta: um banco errado tira o cliente do ar ou
 * aponta para dados de outro cliente.
 */
export default function ClientDatabasesPanel({
  clientId,
}: {
  clientId: string;
}) {
  const [rows, setRows] = useState<AdminClientDatabase[] | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reapplying, setReapplying] = useState(false);

  const load = useCallback(() => {
    adminApi.clientDatabases
      .list(clientId)
      .then(setRows)
      .catch(err =>
        setError(
          err instanceof Error
            ? err.message
            : "Falha ao carregar os bancos do cliente"
        )
      );
  }, [clientId]);

  useEffect(load, [load]);

  async function apply(row: AdminClientDatabase) {
    setApplying(row.applicationId);
    setError("");
    setNotice("");
    try {
      await adminApi.clientDatabases.applyRule(clientId, row.applicationId);
      setNotice(
        `${row.applicationName}: banco refeito pela regra atual. O acesso do cliente ja considera a mudanca.`
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar a regra");
    } finally {
      setApplying(null);
    }
  }

  /** Regra: o admin do cliente tem todas as permissoes de admin em todo modulo contratado. */
  async function reapplyAdmin() {
    setReapplying(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.clientAccess.reapplyAdmin(clientId);
      setNotice(
        `Permissoes de admin aplicadas em ${result.applications} modulo(s) para ${result.admins} admin(s). O admin precisa sair e entrar de novo.` +
          (result.databasesPending.length
            ? ` Sem banco pela regra: ${result.databasesPending.join(", ")}.`
            : "")
      );
      load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao aplicar as permissoes de admin"
      );
    } finally {
      setReapplying(false);
    }
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <Label className="form-label mb-0">Acesso por modulo</Label>
        <Button
          size="sm"
          color="soft-secondary"
          disabled={reapplying}
          onClick={() => void reapplyAdmin()}
        >
          {reapplying ? (
            <Spinner size="sm" className="me-1" />
          ) : (
            <i className="ri-shield-user-line me-1" />
          )}
          Reaplicar permissoes de admin
        </Button>
      </div>
      <p className="text-muted small mb-2">
        O admin do cliente recebe todas as permissoes de admin de cada modulo
        contratado, no cadastro e ao contratar um modulo novo.
      </p>
      {error ? (
        <Alert color="danger" className="py-2">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert color="success" className="py-2" toggle={() => setNotice("")}>
          {notice}
        </Alert>
      ) : null}
      {rows === null ? (
        <div>
          <Spinner size="sm" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted small mb-0">Nenhum modulo contratado.</p>
      ) : (
        <Table size="sm" className="align-middle mb-0">
          <thead>
            <tr>
              <th>Modulo</th>
              <th>Banco atual</th>
              <th>Situacao</th>
              <th>Regra do app</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const status = row.current?.status;
              const usable = status === "active";
              return (
                <tr key={row.applicationId}>
                  <td>{row.applicationName}</td>
                  <td className="small">
                    {row.current ? (
                      <>
                        {ISOLATION_LABELS[row.current.strategy] ??
                          row.current.strategy}
                        <span className="d-block text-muted">
                          {row.current.databaseName}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">sem registro</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${usable ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
                    >
                      {status
                        ? (DATABASE_REF_STATUS_LABELS[status] ?? status)
                        : "sem banco"}
                    </span>
                    {!usable ? (
                      <span className="d-block small text-warning">
                        O cliente nao consegue entrar neste modulo.
                      </span>
                    ) : null}
                  </td>
                  <td className="small">
                    {row.ruleStrategy
                      ? (ISOLATION_LABELS[row.ruleStrategy] ?? row.ruleStrategy)
                      : "sem regra"}
                    {row.ruleStrategy && !row.ruleSupported ? (
                      <span className="d-block text-muted">
                        ainda nao implementado
                      </span>
                    ) : null}
                  </td>
                  <td className="text-end">
                    {row.followsRule ? (
                      <span className="small text-muted">segue a regra</span>
                    ) : row.canApply ? (
                      <Button
                        size="sm"
                        color="soft-primary"
                        disabled={applying !== null}
                        onClick={() => void apply(row)}
                      >
                        {applying === row.applicationId ? (
                          <Spinner size="sm" className="me-1" />
                        ) : (
                          <i className="ri-refresh-line me-1" />
                        )}
                        Aplicar regra atual
                      </Button>
                    ) : (
                      <span className="small text-muted">
                        {row.blockedReason
                          ? DATABASE_BLOCKED_LABELS[row.blockedReason]
                          : "ajuste a regra do app"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
