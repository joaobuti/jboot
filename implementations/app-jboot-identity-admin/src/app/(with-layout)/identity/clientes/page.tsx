"use client";

import React, { useEffect, useMemo, useState } from "react";
import Select, { MultiValue } from "react-select";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Container,
  FormFeedback,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import { AdminTable } from "@/components/jboot/AdminTable";
import ClientDatabasesPanel from "@/components/jboot/ClientDatabasesPanel";
import { IdentityCrudModal } from "@/components/jboot/IdentityCrudModal";
import { adminApi, AdminApplication, AdminCapability, AdminClient, inviteMessage, isEmail } from "@/lib/admin-api";
import { documentTypeFor, formatCpfCnpj, onlyDigits } from "@/lib/document-mask";
import { amountToCents, centsDigits, centsToAmount, formatBrl, formatCents } from "@/lib/money";

interface ClientOverview extends AdminClient {
  apps: string;
}

interface SelectOption {
  value: string;
  label: string;
}

const emptyForm = {
  clientType: "company",
  clientDocumentType: "cnpj",
  clientDocumentNumber: "",
  legalName: "",
  tradeName: "",
  /** Mensalidade em centavos (so digitos); a tela mostra em reais. */
  monthlyFeeCents: "",
  applicationIds: [] as string[],
  capabilitySlugs: [] as string[],
  planCode: "",
  adminDocumentType: "cpf",
  adminDocumentNumber: "",
  adminName: "",
  adminEmail: "",
};

const ClientesPage = () => {
  const [apps, setApps] = useState<AdminApplication[]>([]);
  const [capabilities, setCapabilities] = useState<AdminCapability[]>([]);
  const [rows, setRows] = useState<ClientOverview[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientOverview | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    adminApi.applications.list()
      .then(setApps)
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar apps"));
    adminApi.capabilities.list()
      .then(setCapabilities)
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar sub-modulos"));
  }, []);

  const loadClients = () => {
    setLoading(true);
    adminApi.clients.list()
      .then(async clientRows => {
        const overview = await Promise.all(clientRows.map(async client => {
          const clientApps = await adminApi.clientApplications.list(client.id);
          return {
            ...client,
            apps: clientApps.map(app => `${app.applicationName} (${app.status})`).join(", ") || "Sem apps vinculados",
          };
        }));
        setRows(overview);
      })
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar clientes"))
      .finally(() => setLoading(false));
  };

  useEffect(loadClients, []);

  const appOptions = useMemo<SelectOption[]>(() => apps.map(app => ({
    value: app.id,
    label: `${app.name} (${app.slug})`,
  })), [apps]);

  const selectedAppOptions = appOptions.filter(option => form.applicationIds.includes(option.value));

  /**
   * Sub-modulos visiveis sao apenas os das applications atualmente marcadas no
   * form: marcar/desmarcar um modulo muda a lista na hora. Application sem
   * sub-modulo no catalogo nao gera secao vazia.
   */
  const submoduleGroups = useMemo(() => apps
    .filter(app => form.applicationIds.includes(app.id))
    .map(app => ({
      app,
      items: capabilities.filter(capability => capability.applicationSlug === app.slug),
    }))
    .filter(group => group.items.length > 0), [apps, capabilities, form.applicationIds]);

  /** Capacidades sem produto contratadas por cliente (DataJud, DJEN): secao propria. */
  const standaloneCapabilities = useMemo(
    () => capabilities.filter(capability => capability.applicationSlug === null && capability.clientContractable),
    [capabilities]
  );
  const capabilityLabel = (slug: string) => capabilities.find(capability => capability.slug === slug)?.label ?? slug;

  /** Desmarcar a base desmarca as dependentes (DJEN cai junto com o DataJud). */
  const toggleStandaloneCapability = (slug: string, enabled: boolean) => setForm(current => {
    if (enabled) return { ...current, capabilitySlugs: [...new Set([...current.capabilitySlugs, slug])] };
    const removed = new Set([slug]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const capability of capabilities) {
        if (capability.requiresCapability && removed.has(capability.requiresCapability) && !removed.has(capability.slug)) {
          removed.add(capability.slug);
          grew = true;
        }
      }
    }
    return { ...current, capabilitySlugs: current.capabilitySlugs.filter(item => !removed.has(item)) };
  });

  const toggleCapability = (slug: string, enabled: boolean) => setForm(current => ({
    ...current,
    capabilitySlugs: enabled
      ? [...new Set([...current.capabilitySlugs, slug])]
      : current.capabilitySlugs.filter(item => item !== slug),
  }));

  const columns = useMemo(() => [
    { key: "legalName", label: "Cliente" },
    { key: "tradeName", label: "Nome fantasia" },
    { key: "apps", label: "Modulos contratados" },
    { key: "monthlyFee", label: "Mensalidade", render: (item: ClientOverview) => formatBrl(item.monthlyFee) },
    {
      key: "status",
      label: "Status",
      render: (item: ClientOverview) => (
        <span className={`badge ${item.status === "active" ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}>
          {item.status}
        </span>
      ),
    },
  ], []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const openEdit = async (client: ClientOverview) => {
    setEditing(client);
    setForm({
      ...emptyForm,
      clientType: client.clientType,
      clientDocumentType: client.documentType ?? "cnpj",
      legalName: client.legalName,
      tradeName: client.tradeName ?? "",
      monthlyFeeCents: amountToCents(client.monthlyFee),
    });
    setError("");
    setSuccess("");
    setModalOpen(true);

    // Contrato e sub-modulos vem do servidor: a listagem so traz os apps como
    // texto concatenado, insuficiente para reidratar o form.
    try {
      const [clientApps, clientCapabilities] = await Promise.all([
        adminApi.clientApplications.list(client.id),
        adminApi.clientCapabilities.list(client.id),
      ]);
      setForm(current => ({
        ...current,
        applicationIds: clientApps
          .filter(app => app.status !== "cancelled")
          .map(app => app.applicationId),
        capabilitySlugs: clientCapabilities
          .filter(capability => capability.enabled)
          .map(capability => capability.slug),
        planCode: clientApps.find(app => app.planCode)?.planCode ?? "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar contrato do cliente");
    }
  };

  /**
   * Estado completo dos sub-modulos para o PUT em lote. Sub-modulo cujo modulo
   * pai foi descontratado vai como `false`: desmarcar o modulo tem que desligar
   * o que dependia dele, senao a capability ficaria ligada orfa.
   */
  const buildCapabilityPayload = () => {
    const contractedSlugs = new Set(
      apps.filter(app => form.applicationIds.includes(app.id)).map(app => app.slug)
    );
    return capabilities.map(capability => ({
      slug: capability.slug,
      enabled: form.capabilitySlugs.includes(capability.slug)
        && (capability.applicationSlug === null || contractedSlugs.has(capability.applicationSlug)),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editing) {
        await adminApi.clients.update(editing.id, {
          clientType: form.clientType,
          legalName: form.legalName,
          tradeName: form.tradeName || undefined,
          monthlyFee: centsToAmount(form.monthlyFeeCents),
        });

        // Contrato relido do servidor no momento do save: o form pode ter ficado
        // aberto enquanto outro operador mexia no mesmo cliente.
        const currentApps = await adminApi.clientApplications.list(editing.id);
        const activeIds = new Set(
          currentApps.filter(app => app.status !== "cancelled").map(app => app.applicationId)
        );
        const selectedIds = new Set(form.applicationIds);

        const toAdd = [...selectedIds].filter(id => !activeIds.has(id));
        const toRemove = [...activeIds].filter(id => !selectedIds.has(id));
        const reactivate = currentApps.filter(
          app => app.status === "cancelled" && selectedIds.has(app.applicationId)
        );

        await Promise.all([
          ...toAdd
            .filter(id => !reactivate.some(app => app.applicationId === id))
            .map(id => adminApi.clientApplications.create(editing.id, {
              applicationId: id,
              status: "active",
              planCode: form.planCode || undefined,
            })),
          ...reactivate.map(app => adminApi.clientApplications.update(editing.id, app.applicationId, {
            status: "active",
            planCode: form.planCode || undefined,
          })),
          ...toRemove.map(id => adminApi.clientApplications.remove(editing.id, id)),
        ]);

        await adminApi.clientCapabilities.set(editing.id, buildCapabilityPayload());

        setSuccess("Cliente, modulos contratados e sub-modulos atualizados.");
        setModalOpen(false);
        loadClients();
        return;
      }

      const applications = form.applicationIds.map(applicationId => ({
        applicationId,
        status: "active",
        planCode: form.planCode || undefined,
      }));

      const created = await adminApi.onboarding.createClient({
        client: {
          clientType: form.clientType,
          documentType: form.clientDocumentNumber ? documentTypeFor(form.clientDocumentNumber) : form.clientDocumentType,
          documentNumber: form.clientDocumentNumber || undefined,
          legalName: form.legalName,
          tradeName: form.tradeName || undefined,
          monthlyFee: centsToAmount(form.monthlyFeeCents),
        },
        application: applications[0],
        applications,
        admin: {
          documentType: form.adminDocumentType,
          documentNumber: form.adminDocumentNumber,
          displayName: form.adminName,
          email: form.adminEmail.trim(),
        },
      });

      const payload = buildCapabilityPayload();
      if (created?.client?.id && payload.some(entry => entry.enabled)) {
        await adminApi.clientCapabilities.set(created.client.id, payload);
      }

      setSuccess(`Cliente criado. ${inviteMessage(created.invite)}`);
      setModalOpen(false);
      loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no onboarding");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (client: ClientOverview) => {
    await adminApi.clients.remove(client.id);
    loadClients();
  };

  const canSave = Boolean(
    form.legalName &&
    (editing || (
      form.applicationIds.length > 0 &&
      form.adminName &&
      form.adminDocumentNumber &&
      isEmail(form.adminEmail)
    ))
  );

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col lg={12}>
            <Card>
              <CardHeader>
                <h5 className="card-title mb-0">Clientes</h5>
              </CardHeader>
              <CardBody>
                {error ? <Alert color="danger">{error}</Alert> : null}
                {success ? <Alert color="success">{success}</Alert> : null}
                {loading ? <Spinner /> : null}
                <AdminTable columns={columns} data={rows} search={search} onSearch={setSearch} onAdd={openCreate} onEdit={openEdit} onRemove={remove} />
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>

      <IdentityCrudModal
        isOpen={modalOpen}
        title={editing ? "Editar cliente" : "Adicionar cliente"}
        saving={saving}
        canSave={canSave}
        onClose={() => setModalOpen(false)}
        onSubmit={save}
      >
        <h6 className="mb-3">Dados do cadastro</h6>
        <Row className="g-3">
          <Col xs={12}>
            <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mt-1 mb-0">Cliente</p>
          </Col>
          <Col md={6}>
            <Label className="form-label">Nome legal</Label>
                <Input value={form.legalName} onChange={event => setForm({ ...form, legalName: event.target.value })} />
          </Col>
          <Col md={6}>
            <Label className="form-label">Nome fantasia</Label>
                <Input value={form.tradeName} onChange={event => setForm({ ...form, tradeName: event.target.value })} />
          </Col>
          <Col md={6}>
            <Label className="form-label">Tipo</Label>
                <Input type="select" value={form.clientType} onChange={event => setForm({ ...form, clientType: event.target.value })}>
                  <option value="company">Empresa</option>
                  <option value="person">Pessoa</option>
                  <option value="public_agency">Orgao publico</option>
                </Input>
          </Col>
          {!editing ? <Col md={6}>
            <Label className="form-label">Documento cliente</Label>
                <Input
                  inputMode="numeric"
                  placeholder="CPF ou CNPJ"
                  value={formatCpfCnpj(form.clientDocumentNumber)}
                  onChange={event => setForm({ ...form, clientDocumentNumber: onlyDigits(event.target.value) })}
                />
          </Col> : null}
          <Col xs={12}>
            <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mt-3 mb-0">Contrato</p>
          </Col>
          <Col md={8}>
            <Label className="form-label">Modulos contratados</Label>
            <Select
              classNamePrefix="react-select"
              instanceId="identity-client-applications"
              isMulti
              noOptionsMessage={() => "Nenhum modulo encontrado"}
              onChange={(options: MultiValue<SelectOption>) => setForm({
                ...form,
                applicationIds: options.map(option => option.value),
              })}
              options={appOptions}
              placeholder="Selecione os modulos"
              value={selectedAppOptions}
            />
          </Col>
          {/* "Plano" (plan_code) saiu da tela: nunca teve consumidor. O valor existente segue preservado no save. */}
          <Col md={4}>
            <Label className="form-label" for="client-monthly-fee">Mensalidade</Label>
            <div className="input-group">
              <span className="input-group-text">R$</span>
              <Input
                id="client-monthly-fee"
                inputMode="numeric"
                placeholder="0,00"
                value={formatCents(form.monthlyFeeCents)}
                onChange={event => setForm({ ...form, monthlyFeeCents: centsDigits(event.target.value) })}
              />
            </div>
          </Col>

          {submoduleGroups.length > 0 ? (
            <Col xs={12}>
              <Label className="form-label">Sub-modulos</Label>
              <div className="d-flex flex-column gap-3">
                {submoduleGroups.map(group => (
                  <div key={group.app.id}>
                    <p className="text-muted small mb-2">{group.app.name}</p>
                    <div className="d-flex flex-wrap gap-4">
                      {group.items.map(capability => (
                        <div className="form-check" key={capability.slug}>
                          <Input
                            checked={form.capabilitySlugs.includes(capability.slug)}
                            className="form-check-input"
                            id={`capability-${capability.slug}`}
                            onChange={event => toggleCapability(capability.slug, event.target.checked)}
                            type="checkbox"
                          />
                          <Label className="form-check-label" for={`capability-${capability.slug}`}>
                            {capability.label}
                            {capability.description ? (
                              <span className="d-block text-muted small">{capability.description}</span>
                            ) : null}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Col>
          ) : null}

          {standaloneCapabilities.length > 0 ? (
            <Col xs={12}>
              <Label className="form-label">Capacidades</Label>
              <div className="d-flex flex-wrap gap-4">
                {standaloneCapabilities.map(capability => {
                  const blocked = Boolean(capability.requiresCapability)
                    && !form.capabilitySlugs.includes(capability.requiresCapability as string);
                  return (
                    <div className="form-check" key={capability.slug}>
                      <Input
                        checked={form.capabilitySlugs.includes(capability.slug)}
                        className="form-check-input"
                        disabled={blocked}
                        id={`capability-${capability.slug}`}
                        onChange={event => toggleStandaloneCapability(capability.slug, event.target.checked)}
                        type="checkbox"
                      />
                      <Label className="form-check-label" for={`capability-${capability.slug}`}>
                        {capability.label}
                        {capability.description ? (
                          <span className="d-block text-muted small">{capability.description}</span>
                        ) : null}
                        {capability.requiresCapability ? (
                          <span className={`d-block small ${blocked ? "text-warning" : "text-muted"}`}>
                            Exige {capabilityLabel(capability.requiresCapability)}
                          </span>
                        ) : null}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </Col>
          ) : null}

          {editing ? (
            <Col xs={12}>
              <ClientDatabasesPanel clientId={editing.id} />
            </Col>
          ) : null}

          {!editing ? (
            <>
              <Col xs={12}>
                <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mt-3 mb-0">Admin do cliente</p>
              </Col>
              <Col md={6}>
                <Label className="form-label">Nome</Label>
                <Input value={form.adminName} onChange={event => setForm({ ...form, adminName: event.target.value })} />
              </Col>
              <Col md={6}>
                <Label className="form-label">CPF admin</Label>
                <Input
                  inputMode="numeric"
                  value={formatCpfCnpj(form.adminDocumentNumber)}
                  onChange={event => setForm({ ...form, adminDocumentNumber: onlyDigits(event.target.value) })}
                />
              </Col>
              <Col md={6}>
                <Label className="form-label" for="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="off"
                  value={form.adminEmail}
                  invalid={Boolean(form.adminEmail) && !isEmail(form.adminEmail)}
                  onChange={event => setForm({ ...form, adminEmail: event.target.value })}
                />
                <FormFeedback>Informe um e-mail valido.</FormFeedback>
              </Col>
              <Col xs={12}>
                <p className="text-muted small mb-0">
                  <i className="ri-mail-send-line me-1" />
                  O admin recebe neste e-mail o login e um link para criar a propria senha (vale 72 horas).
                </p>
              </Col>
            </>
          ) : null}
        </Row>
      </IdentityCrudModal>
    </div>
  );
};

export default ClientesPage;
