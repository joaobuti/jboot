"use client";

import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { Alert, Button, Card, CardBody, CardHeader, Col, Container, Input, Label, Row, Spinner } from "reactstrap";
import { AdminTable } from "@/components/jboot/AdminTable";
import { IdentityCrudModal } from "@/components/jboot/IdentityCrudModal";
import { adminApi, AdminApplication, AdminApplicationDatabase, AdminClientDatabase, AdminDatabase } from "@/lib/admin-api";

const emptyRule = { databaseId: "", role: "primary", isolationStrategy: "shared_db", required: true };

const AppDatabasesPage = () => {
  const [apps, setApps] = useState<AdminApplication[]>([]);
  const [databases, setDatabases] = useState<AdminDatabase[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [rows, setRows] = useState<AdminApplicationDatabase[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminApplicationDatabase | null>(null);
  const [form, setForm] = useState(emptyRule);
  /** Clientes cujo banco nao segue a regra atual do app (docs/product/tenant-isolation-sprints.md). */
  const [outdated, setOutdated] = useState<AdminClientDatabase[]>([]);
  const [applyingAll, setApplyingAll] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([adminApi.applications.list(), adminApi.databases.list()])
      .then(([appRows, dbRows]) => {
        setApps(appRows);
        setDatabases(dbRows);
        setSelectedAppId(appRows[0]?.id ?? "");
      })
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar base"))
      .finally(() => setLoading(false));
  }, []);

  const loadAlignment = (applicationId: string) =>
    adminApi.clientDatabases.alignment(applicationId)
      .then(result => setOutdated(result.outdated))
      .catch(() => setOutdated([]));

  useEffect(() => {
    setNotice("");
    if (!selectedAppId) {
      setRows([]);
      setOutdated([]);
      return;
    }
    setLoading(true);
    adminApi.applicationDatabases.list(selectedAppId)
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar vinculos"))
      .finally(() => setLoading(false));
    void loadAlignment(selectedAppId);
  }, [selectedAppId]);

  const applyToAll = async () => {
    setApplyingAll(true);
    setError("");
    try {
      const result = await adminApi.clientDatabases.applyRuleToAll(selectedAppId);
      setNotice(
        `Regra aplicada a ${result.applied} cliente(s).` +
        (result.skipped ? ` ${result.skipped} ficaram de fora (dados em outro banco ou isolamento ainda nao implementado); veja no cadastro de cada cliente.` : "")
      );
      await loadAlignment(selectedAppId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar a regra");
    } finally {
      setApplyingAll(false);
    }
  };

  const canApplyCount = outdated.filter(item => item.canApply).length;

  const columns = useMemo(() => [
    { key: "role", label: "Papel" },
    { key: "databaseName", label: "Database" },
    { key: "isolationStrategy", label: "Isolamento" },
    { key: "required", label: "Obrigatorio", render: (item: AdminApplicationDatabase) => item.required ? "Sim" : "Nao" },
    {
      key: "status",
      label: "Status",
      render: (item: AdminApplicationDatabase) => (
        <span className={`badge ${item.status === "active" ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}>
          {item.status}
        </span>
      ),
    },
  ], []);

  const appOptions = useMemo(() => apps.map(app => ({
    value: app.id,
    label: `${app.name} (${app.slug})`,
  })), [apps]);

  const databaseOptions = useMemo(() => databases.map(database => ({
    value: database.id,
    label: `${database.name} (${database.slug})`,
  })), [databases]);

  const selectedAppOption = appOptions.find(option => option.value === selectedAppId) ?? null;
  const selectedDatabaseOption = databaseOptions.find(option => option.value === form.databaseId) ?? null;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyRule);
    setModalOpen(true);
  };

  const openEdit = (rule: AdminApplicationDatabase) => {
    setEditing(rule);
    setForm({
      databaseId: rule.databaseId ?? "",
      role: rule.role,
      isolationStrategy: rule.isolationStrategy,
      required: rule.required,
    });
    setModalOpen(true);
  };

  const loadRows = () => selectedAppId ? adminApi.applicationDatabases.list(selectedAppId).then(setRows) : undefined;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        databaseId: form.databaseId || undefined,
        isolationStrategy: form.isolationStrategy,
        required: form.required,
      };
      if (editing) {
        // O papel nao muda na edicao (campo travado); a API de edicao recusa `role`.
        await adminApi.applicationDatabases.update(selectedAppId, editing.id, payload);
      } else {
        await adminApi.applicationDatabases.create(selectedAppId, { ...payload, role: form.role });
      }
      setModalOpen(false);
      await loadRows();
      await loadAlignment(selectedAppId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar vinculo");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule: AdminApplicationDatabase) => {
    await adminApi.applicationDatabases.remove(selectedAppId, rule.id);
    await loadRows();
  };

  return (
    <div className="page-content">
      <Container fluid><Row><Col lg={12}><Card>
        <CardHeader><h5 className="card-title mb-0">Databases dos Apps</h5></CardHeader>
        <CardBody>
          {error ? <Alert color="danger">{error}</Alert> : null}
          <div className="mb-3">
            <Label>App</Label>
            <Select
              classNamePrefix="react-select"
              instanceId="app-database-application"
              isClearable
              noOptionsMessage={() => "Nenhum app encontrado"}
              onChange={option => setSelectedAppId(option?.value ?? "")}
              options={appOptions}
              placeholder="Selecione o app"
              value={selectedAppOption}
            />
          </div>
          {notice ? <Alert color="success" toggle={() => setNotice("")}>{notice}</Alert> : null}
          {outdated.length > 0 ? (
            <Alert color="warning" className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <span>
                {outdated.length} cliente(s) com banco fora da regra atual deste app
                {outdated.some(item => item.current?.status !== "active") ? " (alguns sem conseguir entrar)" : ""}:{" "}
                {outdated.slice(0, 5).map(item => item.clientName).join(", ")}
                {outdated.length > 5 ? "..." : ""}
              </span>
              {canApplyCount > 0 ? (
                <Button size="sm" color="warning" disabled={applyingAll} onClick={() => void applyToAll()}>
                  {applyingAll ? <Spinner size="sm" className="me-1" /> : <i className="ri-refresh-line me-1" />}
                  Aplicar a todos ({canApplyCount})
                </Button>
              ) : (
                <span className="small">Nenhum pode ser corrigido automaticamente; veja o motivo no cadastro de cada cliente.</span>
              )}
            </Alert>
          ) : null}
          {loading ? <Spinner /> : null}
          <AdminTable columns={columns} data={rows} search={search} onSearch={setSearch} onAdd={openCreate} onEdit={openEdit} onRemove={remove} />
        </CardBody>
      </Card></Col></Row></Container>

      <IdentityCrudModal
        isOpen={modalOpen}
        title={editing ? "Editar regra" : "Adicionar regra"}
        saving={saving}
        canSave={Boolean(selectedAppId)}
        onClose={() => setModalOpen(false)}
        onSubmit={save}
      >
        <h6 className="mb-3">Dados do cadastro</h6>
        <Row className="g-3">
          <Col md={6}>
            <Label className="form-label">Database</Label>
            <Select
              classNamePrefix="react-select"
              instanceId="app-database-database"
              isClearable
              noOptionsMessage={() => "Nenhum database encontrado"}
              onChange={option => setForm({ ...form, databaseId: option?.value ?? "" })}
              options={databaseOptions}
              placeholder="Sem database catalogado"
              value={selectedDatabaseOption}
            />
          </Col>
          <Col md={6}><Label className="form-label">Papel</Label><Input disabled={!!editing} value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} /></Col>
          <Col md={6}>
            <Label className="form-label">Isolamento</Label>
            <Input type="select" value={form.isolationStrategy} onChange={event => setForm({ ...form, isolationStrategy: event.target.value })}>
              <option value="none">Sem banco</option>
              <option value="shared_db">Database compartilhado</option>
              <option value="schema_per_client">Schema por cliente</option>
              <option value="dedicated_database">Database dedicado</option>
            </Input>
          </Col>
          <Col md={4}>
            <Label className="form-label d-block">Obrigatorio</Label>
            <div className="form-check mt-2">
            <Input className="form-check-input" type="checkbox" checked={form.required} onChange={event => setForm({ ...form, required: event.target.checked })} />
            <Label className="form-check-label">Obrigatorio</Label>
            </div>
          </Col>
        </Row>
      </IdentityCrudModal>
    </div>
  );
};

export default AppDatabasesPage;
