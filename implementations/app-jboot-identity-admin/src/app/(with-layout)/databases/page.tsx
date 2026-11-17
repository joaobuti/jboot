"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Card, CardBody, CardHeader, Col, Container, Input, Label, Row, Spinner } from "reactstrap";
import { AdminTable } from "@/components/jboot/AdminTable";
import { IdentityCrudModal } from "@/components/jboot/IdentityCrudModal";
import { adminApi, AdminDatabase } from "@/lib/admin-api";

const emptyDb = { slug: "", name: "", engine: "postgres", connectionName: "postgres.default", defaultDatabaseName: "" };

const DatabasesPage = () => {
  const [rows, setRows] = useState<AdminDatabase[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminDatabase | null>(null);
  const [form, setForm] = useState(emptyDb);

  const load = () => {
    setLoading(true);
    adminApi.databases.list().then(setRows).catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar databases")).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const columns = useMemo(() => [
    { key: "name", label: "Nome" },
    { key: "slug", label: "Slug" },
    { key: "engine", label: "Engine" },
    { key: "connectionName", label: "Conexao" },
    { key: "defaultDatabaseName", label: "Database" },
    {
      key: "status",
      label: "Status",
      render: (item: AdminDatabase) => (
        <span className={`badge ${item.status === "active" ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}>
          {item.status}
        </span>
      ),
    },
  ], []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyDb);
    setModalOpen(true);
  };

  const openEdit = (database: AdminDatabase) => {
    setEditing(database);
    setForm({
      slug: database.slug,
      name: database.name,
      engine: database.engine,
      connectionName: database.connectionName,
      defaultDatabaseName: database.defaultDatabaseName,
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await adminApi.databases.update(editing.id, {
          name: form.name,
          connectionName: form.connectionName,
          defaultDatabaseName: form.defaultDatabaseName,
        });
      } else {
        await adminApi.databases.create(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar database");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (database: AdminDatabase) => {
    await adminApi.databases.remove(database.id);
    load();
  };

  return (
    <div className="page-content">
      <Container fluid><Row><Col lg={12}><Card>
        <CardHeader><h5 className="card-title mb-0">Databases</h5></CardHeader>
        <CardBody>
          {error ? <Alert color="danger">{error}</Alert> : null}
          {loading ? <Spinner /> : null}
          <AdminTable columns={columns} data={rows} search={search} onSearch={setSearch} onAdd={openCreate} onEdit={openEdit} onRemove={remove} />
        </CardBody>
      </Card></Col></Row></Container>

      <IdentityCrudModal
        isOpen={modalOpen}
        title={editing ? "Editar database" : "Adicionar database"}
        saving={saving}
        canSave={Boolean(form.name && form.slug && form.defaultDatabaseName)}
        onClose={() => setModalOpen(false)}
        onSubmit={save}
      >
        <h6 className="mb-3">Dados do cadastro</h6>
        <Row className="g-3">
          <Col md={6}><Label className="form-label">Nome</Label><Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Col>
          <Col md={6}><Label className="form-label">Slug</Label><Input disabled={!!editing} value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value })} /></Col>
          <Col md={6}>
            <Label className="form-label">Engine</Label>
            <Input disabled={!!editing} type="select" value={form.engine} onChange={event => setForm({ ...form, engine: event.target.value })}>
              <option value="postgres">PostgreSQL</option>
              <option value="mongodb">MongoDB</option>
              <option value="mysql">MySQL</option>
              <option value="mssql">SQL Server</option>
              <option value="clickhouse">ClickHouse</option>
              <option value="qdrant">Qdrant</option>
            </Input>
          </Col>
          <Col md={6}><Label className="form-label">Connection name</Label><Input value={form.connectionName} onChange={event => setForm({ ...form, connectionName: event.target.value })} /></Col>
          <Col md={6}><Label className="form-label">Database padrao</Label><Input value={form.defaultDatabaseName} onChange={event => setForm({ ...form, defaultDatabaseName: event.target.value })} /></Col>
        </Row>
      </IdentityCrudModal>
    </div>
  );
};

export default DatabasesPage;
