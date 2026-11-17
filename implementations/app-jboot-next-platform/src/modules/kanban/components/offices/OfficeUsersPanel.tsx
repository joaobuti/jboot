"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import { kanbanApi, OfficeListItemDto, OfficeUserDto, RemovedAssignmentDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

interface OfficeUsersPanelProps {
  users: OfficeUserDto[];
  offices: OfficeListItemDto[];
  onChanged: () => Promise<void>;
}

/**
 * Vinculo usuario -> escritorios (Sprint 3.5, P22: um ou mais). Lista os usuarios do tenant com
 * acesso ao Flow. Vinculo novo so com escritorio ativo; vinculo existente a escritorio inativo
 * pode ser mantido. Ao sair de um escritorio, o usuario deixa os responsaveis dos cards dele e a
 * tela mostra os cards afetados para redistribuir (P28).
 */
export default function OfficeUsersPanel({ users, offices, onChanged }: OfficeUsersPanelProps) {
  const [editing, setEditing] = useState<OfficeUserDto | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [responsible, setResponsible] = useState<string[]>([]);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [affected, setAffected] = useState<{ user: string; cards: RemovedAssignmentDto[] } | null>(null);
  const names = new Map(offices.map((office) => [office.id, office]));

  function open(user: OfficeUserDto) {
    setEditing(user);
    setSelected(user.officeIds);
    setResponsible(user.responsibleOfficeIds ?? []);
    setFormError(null);
  }

  function close() {
    if (!saving) {
      setEditing(null);
    }
  }

  function toggle(officeId: string) {
    setSelected((prev) => (prev.includes(officeId) ? prev.filter((id) => id !== officeId) : [...prev, officeId]));
    // Sem vinculo nao ha responsabilidade.
    setResponsible((prev) => prev.filter((id) => id !== officeId));
  }

  function toggleResponsible(officeId: string) {
    setResponsible((prev) => (prev.includes(officeId) ? prev.filter((id) => id !== officeId) : [...prev, officeId]));
  }

  async function save() {
    if (!editing) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await kanbanApi.offices.replaceUserOffices(
        editing.identityId,
        selected,
        responsible.filter((id) => selected.includes(id)),
      );
      if (result.aiPermissionsGranted === false) {
        setFormError(null);
        setAiWarning(`${editing.displayName ?? "Usuario"}: escritorios salvos, mas as permissoes de IA do responsavel nao foram concedidas. Conceda "Ver/Administrar agentes de IA" na tela de usuarios do Flow.`);
      }
      setAffected(
        result.removedAssignments.length > 0
          ? { user: editing.displayName ?? "Usuario", cards: result.removedAssignments }
          : null
      );
      setEditing(null);
      await onChanged();
    } catch (err) {
      setFormError(describeKanbanError(err, "Erro ao salvar escritorios do usuario"));
    } finally {
      setSaving(false);
    }
  }

  const selectable = editing ? offices.filter((office) => office.active || editing.officeIds.includes(office.id)) : [];

  return (
    <>
      {aiWarning && (
        <Alert color="warning" toggle={() => setAiWarning(null)}>
          {aiWarning}
        </Alert>
      )}
      {affected && (
        <Alert color="info" toggle={() => setAffected(null)}>
          <strong>{affected.user}</strong> saiu dos responsaveis de {affected.cards.length} card(s) dos escritorios
          removidos. Redistribua:
          <ul className="mb-0 mt-2">
            {affected.cards.map((card) => (
              <li key={card.cardId}>
                <Link href={`/flow/boards/${card.boardId}?card=${card.cardId}`}>
                  {card.boardName} · {card.cardTitle}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <h5 className="mb-0">Usuarios e escritorios</h5>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            O escritorio define quais cards o usuario ve (com a visibilidade ligada). O acesso aos quadros continua
            sendo a membresia de cada quadro. Administradores (flow:admin) veem todos os cards.
          </p>
          {users.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">Nenhum usuario com acesso ao Flow.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Usuario</th>
                    <th>Escritorios</th>
                    <th className="text-end">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.identityId}>
                      <td>
                        {user.displayName ?? "Usuario"}
                        {user.isAdmin && <span className="badge bg-primary-subtle text-primary ms-2">Administrador</span>}
                        {user.email && <div className="text-muted small">{user.email}</div>}
                      </td>
                      <td>
                        {user.officeIds.length === 0 ? (
                          <span className={`badge ${user.isAdmin ? "bg-secondary-subtle text-secondary" : "bg-warning-subtle text-warning"}`}>
                            Sem escritorio
                          </span>
                        ) : (
                          <div className="d-flex flex-wrap gap-1">
                            {user.officeIds.map((officeId) => {
                              const office = names.get(officeId);
                              return (
                                <span key={officeId} className={`badge ${office?.active ? "bg-info-subtle text-info" : "bg-dark-subtle text-dark"}`}>
                                  {user.responsibleOfficeIds?.includes(officeId) && <i className="ri-star-fill me-1" title="Responsável" />}
                                  {office?.name ?? "Escritorio"}
                                  {office && !office.active ? " (inativo)" : ""}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="text-end">
                        <Button size="sm" color="primary" outline onClick={() => open(user)}>
                          Editar escritorios
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

      <Modal isOpen={editing !== null} toggle={close} centered>
        <ModalHeader toggle={close}>Escritorios de {editing?.displayName ?? "usuario"}</ModalHeader>
        <ModalBody>
          {formError && <Alert color="danger">{formError}</Alert>}
          <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">
            <i className="ri-shield-user-line me-1" />
            Escritorios
          </p>
          <p className="text-muted small">
            O responsável valida os documentos dos clientes do escritório: é com o usuário dele que o conector do Flow é
            autorizado na conta Claude do escritório. Ele também vira responsável do card criado quando uma validação é
            confirmada (precisa ser membro do board de entrada).
          </p>
          {selectable.length === 0 ? (
            <p className="text-muted mb-0">Cadastre um escritorio ativo primeiro.</p>
          ) : (
            selectable.map((office) => (
              <div className="form-check mb-2" key={office.id}>
                <Input
                  id={`user-office-${office.id}`}
                  type="checkbox"
                  className="form-check-input"
                  checked={selected.includes(office.id)}
                  onChange={() => toggle(office.id)}
                  disabled={saving}
                />
                <Label for={`user-office-${office.id}`} className="form-check-label">
                  {office.name}
                  {!office.active && <span className="text-muted small ms-1">(inativo: pode ser mantido, nao adicionado)</span>}
                </Label>
                {selected.includes(office.id) && (
                  <div className="form-check form-switch ms-1 mt-1">
                    <Input
                      id={`user-office-responsible-${office.id}`}
                      type="switch"
                      className="form-check-input"
                      checked={responsible.includes(office.id)}
                      onChange={() => toggleResponsible(office.id)}
                      disabled={saving}
                    />
                    <Label for={`user-office-responsible-${office.id}`} className="form-check-label small">
                      Responsável pelo escritório (conecta a conta Claude do escritório)
                    </Label>
                  </div>
                )}
              </div>
            ))
          )}
          <p className="text-muted small mt-3 mb-0">
            Ao remover um escritorio, o usuario deixa de ver os cards dele na proxima acao e sai dos responsaveis desses
            cards. Os cards criados por ele continuam no escritorio.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner size="sm" className="me-1" /> : null}
            Salvar
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
