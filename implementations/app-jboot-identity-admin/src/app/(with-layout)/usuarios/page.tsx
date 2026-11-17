"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Col, Container, Input, Label, Row, Spinner } from "reactstrap";
import { AdminTable } from "@/components/jboot/AdminTable";
import { IdentityCrudModal } from "@/components/jboot/IdentityCrudModal";
import { adminApi, AdminIdentity, inviteMessage } from "@/lib/admin-api";

const emptyUser = { documentType: "cpf", documentNumber: "", displayName: "", email: "", phone: "", password: "" };

const UsuariosPage = () => {
  const [rows, setRows] = useState<AdminIdentity[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviting, setInviting] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminIdentity | null>(null);
  const [form, setForm] = useState(emptyUser);

  const load = () => {
    setLoading(true);
    adminApi.identities.list().then(setRows).catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar usuarios")).finally(() => setLoading(false));
  };

  useEffect(load, []);

  /** Conta pendente (ainda sem senha): novo link de criar senha; o anterior deixa de valer. */
  const resendInvite = async (user: AdminIdentity) => {
    setInviting(user.id);
    setError("");
    setNotice("");
    try {
      setNotice(`${user.displayName}: ${inviteMessage(await adminApi.identities.invite(user.id))}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reenviar o convite");
    } finally {
      setInviting(null);
    }
  };

  const columns = useMemo(() => [
    { key: "displayName", label: "Nome" },
    { key: "email", label: "Email" },
    { key: "documentType", label: "Documento" },
    {
      key: "status",
      label: "Status",
      render: (item: AdminIdentity) => (
        <span className={`badge ${item.status === "active" ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}>
          {item.status === "pending" ? "aguardando senha" : item.status}
        </span>
      ),
    },
    {
      key: "invite",
      label: "Convite",
      render: (item: AdminIdentity) =>
        item.status === "pending" ? (
          <Button size="sm" color="soft-info" disabled={inviting !== null} onClick={() => void resendInvite(item)}>
            {inviting === item.id ? <Spinner size="sm" className="me-1" /> : <i className="ri-mail-send-line me-1" />}
            Reenviar convite
          </Button>
        ) : null,
    },
  ], [inviting]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyUser);
    setModalOpen(true);
  };

  const openEdit = (user: AdminIdentity) => {
    setEditing(user);
    setForm({
      documentType: user.documentType,
      documentNumber: "",
      displayName: user.displayName,
      email: user.email ?? "",
      phone: user.phone ?? "",
      password: "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await adminApi.identities.update(editing.id, {
          displayName: form.displayName,
          email: form.email || undefined,
          phone: form.phone || undefined,
        });
      } else {
        await adminApi.identities.create({
          ...form,
          email: form.email || undefined,
          phone: form.phone || undefined,
          password: form.password || undefined,
        });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar usuario");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (user: AdminIdentity) => {
    await adminApi.identities.remove(user.id);
    load();
  };

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col lg={12}>
            <Card>
              <CardHeader><h5 className="card-title mb-0">Usuarios</h5></CardHeader>
              <CardBody>
                {error ? <Alert color="danger">{error}</Alert> : null}
                {notice ? <Alert color="info" toggle={() => setNotice("")}>{notice}</Alert> : null}
                {loading ? <Spinner /> : null}
                <AdminTable columns={columns} data={rows} search={search} onSearch={setSearch} onAdd={openCreate} onEdit={openEdit} onRemove={remove} />
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>

      <IdentityCrudModal
        isOpen={modalOpen}
        title={editing ? "Editar usuario" : "Adicionar usuario"}
        saving={saving}
        canSave={Boolean(form.displayName && (editing || form.documentNumber))}
        onClose={() => setModalOpen(false)}
        onSubmit={save}
      >
        <h6 className="mb-3">Dados do cadastro</h6>
        <Row className="g-3">
          <Col md={6}><Label className="form-label">Nome</Label><Input value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} /></Col>
          <Col md={6}><Label className="form-label">Email</Label><Input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Col>
          <Col md={6}><Label className="form-label">Telefone</Label><Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Col>
          {!editing ? (
            <>
              <Col md={6}>
                <Label className="form-label">Tipo documento</Label>
                <Input type="select" value={form.documentType} onChange={event => setForm({ ...form, documentType: event.target.value })}>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                </Input>
              </Col>
              <Col md={6}><Label className="form-label">Documento somente numeros</Label><Input value={form.documentNumber} onChange={event => setForm({ ...form, documentNumber: event.target.value })} /></Col>
              <Col md={6}><Label className="form-label">Senha inicial</Label><Input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Col>
            </>
          ) : null}
        </Row>
      </IdentityCrudModal>
    </div>
  );
};

export default UsuariosPage;
