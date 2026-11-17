"use client";

import React, { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { kanbanApi, OfficeListItemDto, OfficeSettingsDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

interface OfficeActivationPanelProps {
  settings: OfficeSettingsDto;
  offices: OfficeListItemDto[];
  onChanged: () => Promise<void>;
}

/**
 * Ativacao da visibilidade por escritorio (Sprint 3.5, P26): antes de ligar, mostra os cards sem
 * escritorio por quadro (atribuicao em lote) e os usuarios sem escritorio. Ligar e desligar pedem
 * confirmacao; desligar volta a regra anterior sem perder dado.
 */
export default function OfficeActivationPanel({ settings, offices, onChanged }: OfficeActivationPanelProps) {
  const [targetByBoard, setTargetByBoard] = useState<Record<string, string>>({});
  const [busyBoardId, setBusyBoardId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeOffices = offices.filter((office) => office.active);
  const enabled = settings.officeVisibilityEnabled;

  async function assign(boardId: string) {
    const officeId = targetByBoard[boardId];
    if (!officeId) {
      return;
    }
    setBusyBoardId(boardId);
    setError(null);
    setNotice(null);
    try {
      const result = await kanbanApi.offices.assignBoardCards(boardId, officeId);
      setNotice(`${result.updated} card(s) atribuido(s).`);
      await onChanged();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao atribuir escritorio aos cards"));
    } finally {
      setBusyBoardId(null);
    }
  }

  async function toggleVisibility() {
    setSaving(true);
    setError(null);
    try {
      await kanbanApi.offices.updateSettings(!enabled);
      setConfirming(false);
      setNotice(enabled ? "Visibilidade por escritorio desligada." : "Visibilidade por escritorio ligada.");
      await onChanged();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao alterar a visibilidade por escritorio"));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert color="success" toggle={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <Card>
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h5 className="mb-0">
            Visibilidade por escritorio{" "}
            <span className={`badge ms-1 ${enabled ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"}`}>
              {enabled ? "Ligada" : "Desligada"}
            </span>
          </h5>
          <Button
            color={enabled ? "danger" : "primary"}
            outline={enabled}
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!enabled && settings.activeOfficeCount === 0}
          >
            <i className={`${enabled ? "ri-eye-off-line" : "ri-eye-line"} align-bottom me-1`} />
            {enabled ? "Desligar" : "Ligar visibilidade por escritorio"}
          </Button>
        </CardHeader>
        <CardBody>
          <p className="text-muted small mb-0">
            Ligada: cada usuario ve so os cards dos seus escritorios, em qualquer quadro; o administrador ve todos os
            cards de todos os quadros. Desligada: vale so a membresia do quadro (regra anterior).
            {!enabled && settings.activeOfficeCount === 0 && " Cadastre ao menos um escritorio ativo para ligar."}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h5 className="mb-0">Cards sem escritorio ({settings.cardsWithoutOffice.total})</h5>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            Com a visibilidade ligada, card sem escritorio so e visto pelo administrador. Atribua em lote por quadro;
            depois, transfira cards individuais pelo proprio card.
          </p>
          {settings.cardsWithoutOffice.byBoard.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">Todos os cards tem escritorio.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Quadro</th>
                    <th>Cards sem escritorio</th>
                    <th className="text-end">Atribuir todos a</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.cardsWithoutOffice.byBoard.map((row) => (
                    <tr key={row.boardId}>
                      <td>{row.boardName}</td>
                      <td>{row.count}</td>
                      <td className="text-end">
                        <div className="d-inline-flex gap-2">
                          <Input
                            bsSize="sm"
                            type="select"
                            style={{ minWidth: 200 }}
                            value={targetByBoard[row.boardId] ?? ""}
                            onChange={(event) => setTargetByBoard((prev) => ({ ...prev, [row.boardId]: event.target.value }))}
                            aria-label={`Escritorio para os cards de ${row.boardName}`}
                          >
                            <option value="">Escritorio...</option>
                            {activeOffices.map((office) => (
                              <option key={office.id} value={office.id}>
                                {office.name}
                              </option>
                            ))}
                          </Input>
                          <Button
                            size="sm"
                            color="primary"
                            onClick={() => void assign(row.boardId)}
                            disabled={!targetByBoard[row.boardId] || busyBoardId === row.boardId}
                          >
                            {busyBoardId === row.boardId ? <Spinner size="sm" /> : "Atribuir"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h5 className="mb-0">Usuarios sem escritorio ({settings.usersWithoutOffice.length})</h5>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            Com a visibilidade ligada, estes usuarios nao veem nem criam cards ate serem vinculados a um escritorio (aba
            Usuarios). Administradores nao entram nesta lista.
          </p>
          {settings.usersWithoutOffice.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">Todos os usuarios tem escritorio.</p>
          ) : (
            <div className="d-flex flex-wrap gap-1">
              {settings.usersWithoutOffice.map((user) => (
                <span key={user.identityId} className="badge bg-warning-subtle text-warning">
                  {user.displayName ?? "Usuario"}
                </span>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={confirming} toggle={() => !saving && setConfirming(false)} centered>
        <ModalHeader toggle={() => !saving && setConfirming(false)}>
          {enabled ? "Desligar visibilidade por escritorio" : "Ligar visibilidade por escritorio"}
        </ModalHeader>
        <ModalBody>
          {enabled ? (
            <p className="mb-0">
              Todos os membros de cada quadro voltam a ver todos os cards do quadro, e o administrador volta a precisar
              ser membro para ver um quadro. Escritorios e atribuicoes sao mantidos.
            </p>
          ) : (
            <>
              <p>Ao ligar:</p>
              <ul className="mb-0">
                <li>
                  <strong>{settings.cardsWithoutOffice.total}</strong> card(s) sem escritorio passam a ser vistos so pelo
                  administrador;
                </li>
                <li>
                  <strong>{settings.usersWithoutOffice.length}</strong> usuario(s) sem escritorio deixam de ver cards;
                </li>
                <li>cada usuario passa a ver so os cards dos seus escritorios, em qualquer quadro.</li>
              </ul>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setConfirming(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button color={enabled ? "danger" : "primary"} onClick={() => void toggleVisibility()} disabled={saving}>
            {saving ? <Spinner size="sm" className="me-1" /> : null}
            {enabled ? "Desligar" : "Ligar"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
