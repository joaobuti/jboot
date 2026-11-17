"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { kanbanApi, OfficeDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { TRANSFER_REASON_MAX_LENGTH, TRANSFER_REASON_MIN_LENGTH, validateTransferReason } from "@/modules/kanban/lib/offices";

interface CardOfficeTransferModalProps {
  isOpen: boolean;
  boardId: string;
  cardId: string;
  currentOfficeId: string | null;
  /** Escritorios do tenant (contexto do admin). */
  offices: OfficeDto[];
  onClose: () => void;
  onTransferred: (officeId: string) => void;
}

/**
 * Transferencia do card para outro escritorio (Sprint 3.5, P23): so o
 * administrador, motivo obrigatorio, auditada. Cliente, checklist, documentos e
 * historico acompanham o card. O backend e a barreira; a tela so e oferecida ao admin.
 */
export default function CardOfficeTransferModal({
  isOpen,
  boardId,
  cardId,
  currentOfficeId,
  offices,
  onClose,
  onTransferred,
}: CardOfficeTransferModalProps) {
  const [officeId, setOfficeId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOfficeId("");
      setReason("");
      setError(null);
    }
  }, [isOpen]);

  const options = offices.filter((office) => office.active && office.id !== currentOfficeId);
  const reasonError = validateTransferReason(reason);

  async function handleSubmit() {
    if (!officeId) {
      setError("Escolha o escritorio de destino");
      return;
    }
    if (reasonError) {
      setError(reasonError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await kanbanApi.offices.transferCard(boardId, cardId, officeId, reason.trim());
      onTransferred(officeId);
      onClose();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao transferir o card"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>
        <i className="ri-building-line me-1" />
        Transferir escritorio
      </ModalHeader>
      <ModalBody>
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}
        <p className="small text-muted">
          Cliente, checklist, documentos e historico acompanham o card. Usuarios do escritorio de origem deixam de ver o
          card. <strong>A acao e auditada:</strong> o motivo fica no historico do card.
        </p>
        {options.length === 0 ? (
          <Alert color="warning" className="mb-0">
            Nenhum outro escritorio ativo para transferir.
          </Alert>
        ) : (
          <>
            <FormGroup>
              <Label for="card-office-target">
                Escritorio de destino<span className="text-danger ms-1">*</span>
              </Label>
              <Input
                id="card-office-target"
                type="select"
                value={officeId}
                onChange={(event) => setOfficeId(event.target.value)}
                disabled={saving}
              >
                <option value="">Selecione...</option>
                {options.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </Input>
            </FormGroup>
            <FormGroup className="mb-0">
              <Label for="card-office-reason">
                Motivo<span className="text-danger ms-1">*</span>
              </Label>
              <Input
                id="card-office-reason"
                type="textarea"
                rows={3}
                maxLength={TRANSFER_REASON_MAX_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={saving}
                placeholder="Ex.: lead redistribuido para a base que atende a cidade do cliente"
              />
              <div className="d-flex justify-content-between text-muted small mt-1">
                <span>Minimo de {TRANSFER_REASON_MIN_LENGTH} caracteres. Nao inclua CPF ou dado pessoal.</span>
                <span>
                  {reason.trim().length}/{TRANSFER_REASON_MAX_LENGTH}
                </span>
              </div>
            </FormGroup>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="light" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          color="primary"
          onClick={() => void handleSubmit()}
          disabled={saving || options.length === 0 || !officeId || reasonError !== null}
        >
          {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-arrow-left-right-line me-1" />}
          Transferir
        </Button>
      </ModalFooter>
    </Modal>
  );
}
