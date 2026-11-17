"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Container,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import { AdminTable } from "@/components/jboot/AdminTable";
import { IdentityCrudModal } from "@/components/jboot/IdentityCrudModal";
import { adminApi, AdminApplication } from "@/lib/admin-api";

const emptyApp = { slug: "", name: "", tokenAudience: "" };

const AppsPage = () => {
  const [rows, setRows] = useState<AdminApplication[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminApplication | null>(null);
  const [form, setForm] = useState(emptyApp);

  const load = () => {
    setLoading(true);
    adminApi.applications
      .list()
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar apps"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const columns = useMemo(
    () => [
      { key: "name", label: "Nome" },
      { key: "slug", label: "Slug" },
      { key: "tokenAudience", label: "Audience" },
      {
        key: "status",
        label: "Status",
        render: (item: AdminApplication) => (
          <span className={`badge ${item.status === "active" ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}>
            {item.status}
          </span>
        ),
      },
    ],
    []
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyApp);
    setModalOpen(true);
  };

  const openEdit = (app: AdminApplication) => {
    setEditing(app);
    setForm({ slug: app.slug, name: app.name, tokenAudience: app.tokenAudience });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await adminApi.applications.update(editing.id, {
          name: form.name,
          tokenAudience: form.tokenAudience,
        });
      } else {
        await adminApi.applications.create(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar app");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (app: AdminApplication) => {
    await adminApi.applications.remove(app.id);
    load();
  };

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col lg={12}>
            <Card>
              <CardHeader>
                <h5 className="card-title mb-0">Apps</h5>
              </CardHeader>
              <CardBody>
                {error ? <Alert color="danger">{error}</Alert> : null}
                {loading ? <Spinner /> : null}
                <AdminTable columns={columns} data={rows} search={search} onSearch={setSearch} onAdd={openCreate} onEdit={openEdit} onRemove={remove} />
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>

      <IdentityCrudModal
        isOpen={modalOpen}
        title={editing ? "Editar app" : "Adicionar app"}
        saving={saving}
        canSave={Boolean(form.name && form.slug && form.tokenAudience)}
        onClose={() => setModalOpen(false)}
        onSubmit={save}
      >
        <h6 className="mb-3">Dados do cadastro</h6>
        <Row className="g-3">
          <Col md={6}>
            <Label className="form-label">Nome</Label>
            <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
          </Col>
          <Col md={6}>
            <Label className="form-label">Slug</Label>
            <Input value={form.slug} disabled={!!editing} onChange={event => setForm({ ...form, slug: event.target.value })} />
          </Col>
          <Col md={6}>
            <Label className="form-label">Token audience</Label>
            <Input value={form.tokenAudience} onChange={event => setForm({ ...form, tokenAudience: event.target.value })} />
          </Col>
        </Row>
      </IdentityCrudModal>
    </div>
  );
};

export default AppsPage;
