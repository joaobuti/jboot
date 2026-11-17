"use client";

import React, { useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  FormGroup,
  Input,
  InputGroup,
  InputGroupText,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner
} from "reactstrap";
import { createManagedUser, CreateManagedUserPayload, lookupIdentityByDocument } from "@/lib/identity-manager-api";
import { PdvStockLocation } from "@/modules/pdv/lib/pdv-api";
import { FlowUserManagementContextDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  // PDV-specific: only passed when module = PDV
  pdvStores?: PdvStockLocation[];
  isAdmin?: boolean;
  creatorLocationId?: string;
  flowContext?: FlowUserManagementContextDto;
  flowMode?: boolean;
}

const EMPTY: CreateManagedUserPayload = {
  documentType: "cpf",
  documentNumber: "",
  displayName: "",
  email: "",
  phone: "",
  password: ""
};

const DOC_LENGTHS: Record<string, number> = { cpf: 11, cnpj: 14 };

export function UserFormModal({ isOpen, onClose, onCreated, pdvStores, isAdmin, creatorLocationId, flowContext, flowMode }: Props) {
  const [form, setForm] = useState<CreateManagedUserPayload>(EMPTY);
  const [locationId, setLocationId] = useState<string>("");
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [foundExisting, setFoundExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  const provisioningAttempt = useRef<{ key: string; payload: string } | null>(null);

  const hasPdv = pdvStores !== undefined;
  const multipleStores = hasPdv && pdvStores.length > 1;
  // Admin with multiple stores → show selector
  const showStoreSelect = hasPdv && multipleStores && isAdmin;

  // The store label to display when selection is automatic (non-admin or single store)
  const autoStore = hasPdv
    ? (pdvStores.find((s) => s.id === creatorLocationId) ?? pdvStores.find((s) => s.isMatriz) ?? pdvStores[0])
    : undefined;

  function set(field: keyof CreateManagedUserPayload, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    setForm(EMPTY);
    setLocationId("");
    setOfficeIds([]);
    setError(null);
    setFoundExisting(false);
    provisioningAttempt.current = null;
    onClose();
  }

  async function handleDocumentChange(value: string) {
    set("documentNumber", value);

    const digits = value.replace(/\D/g, "");
    const expectedLen = DOC_LENGTHS[form.documentType] ?? 11;

    if (digits.length < expectedLen) {
      if (foundExisting) {
        setFoundExisting(false);
        setForm(prev => ({ ...prev, displayName: "", email: "", phone: "" }));
      }
      return;
    }

    lookupAbort.current?.abort();
    lookupAbort.current = new AbortController();

    setLooking(true);
    try {
      const identity = await lookupIdentityByDocument(digits);
      if (identity) {
        setFoundExisting(true);
        setForm(prev => ({
          ...prev,
          displayName: identity.displayName,
          email: identity.email ?? "",
          phone: identity.phone ?? ""
        }));
      } else {
        setFoundExisting(false);
      }
    } catch {
      // silently ignore lookup errors
    } finally {
      setLooking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: CreateManagedUserPayload = {
        documentType: form.documentType,
        documentNumber: form.documentNumber.replace(/\D/g, ""),
        displayName: form.displayName
      };
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone;
      if (form.password) payload.password = form.password;

      // Location assignment:
      // - Admin + multiple stores + explicit select → send locationId (BFF uses it)
      // - Non-admin or single store → omit (BFF propagates actor's locationId or Matriz)
      if (showStoreSelect && locationId) {
        payload.locationId = locationId;
      }

      if (flowMode) {
        if (!flowContext) throw new Error("Contexto de escritórios indisponível");
        const flowPayload = {
          identity: payload,
          ...(flowContext.officeAssignmentMode === "selectable" ? { officeIds: [...officeIds].sort() } : {})
        };
        const serializedPayload = JSON.stringify(flowPayload);
        if (provisioningAttempt.current?.payload !== serializedPayload) {
          provisioningAttempt.current = { key: crypto.randomUUID(), payload: serializedPayload };
        }
        const result = await kanbanApi.offices.provisionUser(flowPayload, provisioningAttempt.current.key);
        if (result.state !== "completed") throw new Error("Cadastro em processamento; tente novamente em instantes");
      } else {
        await createManagedUser(payload);
      }
      setForm(EMPTY);
      setLocationId("");
      setOfficeIds([]);
      setFoundExisting(false);
      provisioningAttempt.current = null;
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar usuário");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={handleClose} centered size="xl">
      <Form onSubmit={handleSubmit}>
        <ModalHeader toggle={handleClose}>Novo Usuário</ModalHeader>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          {foundExisting && (
            <Alert color="info" className="d-flex align-items-center gap-2 py-2">
              <i className="ri-user-search-line fs-5" />
              <span>Usuário encontrado — campos preenchidos automaticamente.</span>
            </Alert>
          )}

          <Row className="g-4">
            <Col xs={12} lg={3}>
              <div className="nav flex-lg-column nav-pills gap-2">
                <button type="button" className="nav-link text-start active">
                  <i className="ri-file-user-line me-2" />
                  Dados
                </button>
              </div>
            </Col>
            <Col xs={12} lg={9}>
              <h6 className="mb-3">Dados do usuário</h6>
              <Row className="g-3">
                <Col md={6}>
                  <FormGroup className="mb-0">
                    <Label>Tipo de documento</Label>
                    <Input
                      type="select"
                      value={form.documentType}
                      onChange={e => {
                        const documentType = e.target.value === "cnpj" ? "cnpj" : "cpf";
                        setForm(prev => ({ ...prev, documentType, documentNumber: "" }));
                        setFoundExisting(false);
                      }}
                    >
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                    </Input>
                  </FormGroup>
                </Col>

                <Col md={6}>
                  <FormGroup className="mb-0">
                    <Label>Número do documento *</Label>
                    <InputGroup>
                      <Input
                        required
                        placeholder={form.documentType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                        value={form.documentNumber}
                        onChange={e => handleDocumentChange(e.target.value)}
                      />
                      {looking && (
                        <InputGroupText>
                          <Spinner size="sm" />
                        </InputGroupText>
                      )}
                    </InputGroup>
                  </FormGroup>
                </Col>

                <Col md={6}>
                  <FormGroup className="mb-0">
                    <Label>Nome *</Label>
                    <Input
                      required
                      placeholder="Nome completo"
                      value={form.displayName}
                      onChange={e => set("displayName", e.target.value)}
                    />
                  </FormGroup>
                </Col>

                <Col md={6}>
                  <FormGroup className="mb-0">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={form.email}
                      onChange={e => set("email", e.target.value)}
                    />
                  </FormGroup>
                </Col>

                <Col md={6}>
                  <FormGroup className="mb-0">
                    <Label>Telefone</Label>
                    <Input
                      placeholder="(00) 00000-0000"
                      value={form.phone}
                      onChange={e => set("phone", e.target.value)}
                    />
                  </FormGroup>
                </Col>

                <Col md={6}>
                  <FormGroup className="mb-0">
                    <Label>Senha (mín. 8 caracteres)</Label>
                    <Input
                      type="password"
                      placeholder="Senha de acesso"
                      value={form.password}
                      onChange={e => set("password", e.target.value)}
                    />
                  </FormGroup>
                </Col>

                {/* PDV: store assignment */}
                {hasPdv && (
                  <Col md={12}>
                    <FormGroup className="mb-0">
                      <Label>Loja</Label>
                      {showStoreSelect ? (
                        <Input
                          type="select"
                          value={locationId}
                          onChange={e => setLocationId(e.target.value)}
                          required
                        >
                          <option value="">Selecione a loja...</option>
                          {pdvStores.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}{s.isMatriz ? " (Matriz)" : ""}
                            </option>
                          ))}
                        </Input>
                      ) : (
                        <div className="form-control-plaintext d-flex align-items-center gap-2">
                          <span>{autoStore?.name ?? "—"}</span>
                          {autoStore?.isMatriz && (
                            <Badge color="primary" className="fw-normal" style={{ fontSize: "0.65rem" }}>Matriz</Badge>
                          )}
                          {!multipleStores && (
                            <small className="text-muted">(única loja)</small>
                          )}
                        </div>
                      )}
                    </FormGroup>
                  </Col>
                )}

                {flowContext && (
                  <Col md={12}>
                    <FormGroup className="mb-0">
                      <Label>{flowContext.multipleOffices ? "Escritórios *" : "Escritório *"}</Label>
                      {flowContext.officeAssignmentMode === "selectable" ? (
                        <div className="border rounded p-3">
                          {flowContext.offices.length === 0 && (
                            <Alert color="warning" className="mb-0">Cadastre um escritório ativo antes de criar usuários.</Alert>
                          )}
                          {flowContext.offices.map(office => (
                            <FormGroup check key={office.id} className="mb-2">
                              {/* So flow:admin marca mais de um escritorio (flow-offices-sprints.md, S2). */}
                              <Input
                                type={flowContext.multipleOffices ? "checkbox" : "radio"}
                                name="user-office"
                                checked={officeIds.includes(office.id)}
                                onChange={event => setOfficeIds(current => !flowContext.multipleOffices
                                  ? [office.id]
                                  : event.target.checked
                                    ? [...current, office.id]
                                    : current.filter(id => id !== office.id))}
                              />
                              <Label check>{office.name}</Label>
                            </FormGroup>
                          ))}
                        </div>
                      ) : (
                        <div className="form-control-plaintext">
                          {flowContext.offices.map(office => (
                            <Badge key={office.id} color="light" className="text-body me-2">{office.name}</Badge>
                          ))}
                          <small className="text-muted d-block mt-2">Herdado do seu acesso e não editável.</small>
                        </div>
                      )}
                    </FormGroup>
                  </Col>
                )}
              </Row>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            color="primary"
            type="submit"
            disabled={saving || looking || (flowMode && !flowContext) || (showStoreSelect && !locationId) ||
              (flowContext?.officeAssignmentMode === "selectable" && officeIds.length === 0)}
          >
            {saving ? <><Spinner size="sm" className="me-1" />Salvando</> : "Salvar"}
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  );
}
