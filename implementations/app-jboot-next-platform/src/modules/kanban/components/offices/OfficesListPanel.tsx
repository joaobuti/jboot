"use client";

import React, { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { kanbanApi, OfficeListItemDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { UF_OPTIONS } from "@/modules/kanban/lib/ufs";

interface OfficesListPanelProps {
  offices: OfficeListItemDto[];
  onChanged: () => Promise<void>;
}

/**
 * CRUD de escritorios (Sprint 3.5) no padrao `skills/platform-crud-ui.md`:
 * listagem operacional + modal de criar/editar. Sem exclusao: inativar.
 * Nome, cidade e UF (local do fecho da peticao, S7 de docs/product/flow-initial-petitions-sprints.md):
 * poucos campos, por isso o modal nao tem steps.
 */
export default function OfficesListPanel({ offices, onChanged }: OfficesListPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OfficeListItemDto | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [principal, setPrincipal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function open(office: OfficeListItemDto | null) {
    setEditing(office);
    setName(office?.name ?? "");
    setCity(office?.city ?? "");
    setUf(office?.uf ?? "");
    setPrincipal(Boolean(office?.isPrincipal));
    setFormError(null);
    setModalOpen(true);
  }

  function close() {
    if (!saving) {
      setModalOpen(false);
      setEditing(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Informe o nome do escritorio.");
      return;
    }
    const place = { city: city.trim() || null, uf: uf || null };
    if (!place.city !== !place.uf) {
      setFormError("Informe cidade e UF do escritorio, ou deixe os dois em branco.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      // Principal so se marca (nunca se desmarca direto): marcar outro desmarca este.
      const markPrincipal = principal && !editing?.isPrincipal ? { isPrincipal: true as const } : {};
      if (editing) {
        await kanbanApi.offices.update(editing.id, { name: trimmed, ...place, ...markPrincipal });
      } else {
        const created = await kanbanApi.offices.create({ name: trimmed, ...place });
        if (principal && !created.isPrincipal) await kanbanApi.offices.update(created.id, { isPrincipal: true });
      }
      setModalOpen(false);
      setEditing(null);
      await onChanged();
    } catch (err) {
      setFormError(describeKanbanError(err, "Erro ao salvar escritorio"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(office: OfficeListItemDto) {
    setBusyId(office.id);
    setError(null);
    try {
      await kanbanApi.offices.update(office.id, { active: !office.active });
      await onChanged();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao alterar escritorio"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Card>
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h5 className="mb-0">Escritorios</h5>
          <Button color="primary" size="sm" onClick={() => open(null)}>
            <i className="ri-add-line align-bottom me-1" />
            Novo escritorio
          </Button>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            Escritorio inativo nao recebe usuario nem card novo; usuarios e cards existentes continuam onde estao ate o
            administrador mover.
          </p>
          {offices.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">Nenhum escritorio cadastrado.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Escritorio</th>
                    <th>Cidade</th>
                    <th>Usuarios</th>
                    <th>Cards</th>
                    <th>Situacao</th>
                    <th className="text-end">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {offices.map((office) => (
                    <tr key={office.id}>
                      <td>
                        {office.name}
                        {office.isPrincipal ? (
                          <span className="badge bg-primary-subtle text-primary ms-2" title="Reserva da validacao dos clientes">
                            <i className="ri-star-line me-1" />
                            Principal
                          </span>
                        ) : null}
                      </td>
                      <td>{office.city && office.uf ? `${office.city}/${office.uf}` : "—"}</td>
                      <td>{office.userCount}</td>
                      <td>{office.cardCount}</td>
                      <td>
                        <span className={`badge ${office.active ? "bg-success-subtle text-success" : "bg-dark-subtle text-dark"}`}>
                          {office.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="text-end">
                        <Button size="sm" color="primary" outline className="me-1" onClick={() => open(office)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          color={office.active ? "danger" : "success"}
                          outline
                          onClick={() => void toggleActive(office)}
                          disabled={busyId === office.id || (office.active && office.isPrincipal)}
                          title={office.active && office.isPrincipal ? "Marque outro escritorio como principal antes de inativar este" : undefined}
                        >
                          {busyId === office.id ? <Spinner size="sm" /> : office.active ? "Inativar" : "Reativar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} toggle={close} centered>
        <Form onSubmit={(event) => void submit(event)}>
          <ModalHeader toggle={close}>{editing ? "Editar escritorio" : "Novo escritorio"}</ModalHeader>
          <ModalBody>
            {formError && <Alert color="danger">{formError}</Alert>}
            <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">
              <i className="ri-file-text-line me-1" />
              Dados gerais
            </p>
            <FormGroup>
              <Label for="office-name">
                Nome<span className="text-danger ms-1">*</span>
              </Label>
              <Input
                id="office-name"
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                disabled={saving}
                autoFocus
              />
            </FormGroup>
            <Row className="g-2">
              <Col xs={8}>
                <FormGroup className="mb-0">
                  <Label for="office-city">Cidade</Label>
                  <Input id="office-city" value={city} maxLength={120} onChange={(event) => setCity(event.target.value)} disabled={saving} />
                </FormGroup>
              </Col>
              <Col xs={4}>
                <FormGroup className="mb-0">
                  <Label for="office-uf">UF</Label>
                  <Input id="office-uf" type="select" value={uf} onChange={(event) => setUf(event.target.value)} disabled={saving}>
                    <option value="">—</option>
                    {UF_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Input>
                </FormGroup>
              </Col>
            </Row>
            <div className="form-text">Local do fecho das petições iniciais (ex.: Manaus/AM).</div>
            <FormGroup check className="mt-3">
              <Input
                id="office-principal"
                type="checkbox"
                checked={principal}
                onChange={(event) => setPrincipal(event.target.checked)}
                disabled={saving || Boolean(editing?.isPrincipal)}
              />
              <Label check for="office-principal">
                Escritorio principal
              </Label>
              <div className="form-text">
                {editing?.isPrincipal
                  ? "Este e o escritorio principal. Para trocar, marque outro escritorio como principal."
                  : "So um escritorio e principal: marcar este desmarca o atual. Ele e a reserva da validacao dos clientes quando o escritorio do cliente nao tem agente proprio."}
              </div>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button color="light" type="button" onClick={close} disabled={saving}>
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" className="me-1" /> : null}
              Salvar
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </>
  );
}
