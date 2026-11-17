"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { CardLeadDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { LEAD_RETURN_REASON_MAX, LEAD_RETURN_REASON_MIN, validateLeadReturnReason } from "@/modules/kanban/lib/leads";

interface LeadReturnModalProps {
  isOpen: boolean;
  boardId: string;
  cardId: string;
  onClose: () => void;
  onReturned: (lead: CardLeadDto) => void;
}

/**
 * Devolucao do lead ao escritorio (Sprint 4): so o administrador, motivo
 * obrigatorio e auditado (mesmo padrao do motivo da transferencia de
 * escritorio). O escritorio volta a editar e recebe notificacao com o motivo.
 */
export default function LeadReturnModal({ isOpen, boardId, cardId, onClose, onReturned }: LeadReturnModalProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError(null);
    }
  }, [isOpen]);

  const reasonError = validateLeadReturnReason(reason);

  async function handleSubmit() {
    if (reasonError) {
      setError(reasonError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const lead = await kanbanApi.leads.returnToOffice(boardId, cardId, reason.trim());
      onReturned(lead);
      onClose();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao devolver o lead"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>
        <i className="ri-arrow-go-back-line me-1" />
        Devolver ao escritório
      </ModalHeader>
      <ModalBody>
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}
        <p className="small text-muted">
          O escritório volta a editar o cadastro e os documentos e é notificado com o motivo.{" "}
          <strong>A ação é auditada:</strong> o motivo fica no histórico do card.
        </p>
        <FormGroup className="mb-0">
          <Label for="lead-return-reason">
            Motivo<span className="text-danger ms-1">*</span>
          </Label>
          <Input
            id="lead-return-reason"
            type="textarea"
            rows={3}
            maxLength={LEAD_RETURN_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={saving}
            placeholder="Ex.: procuração sem assinatura; reenviar o documento assinado"
          />
          <div className="d-flex justify-content-between text-muted small mt-1">
            <span>Mínimo de {LEAD_RETURN_REASON_MIN} caracteres. Não inclua CPF ou dado pessoal.</span>
            <span>
              {reason.trim().length}/{LEAD_RETURN_REASON_MAX}
            </span>
          </div>
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="light" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button color="warning" onClick={() => void handleSubmit()} disabled={saving || reasonError !== null}>
          {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-arrow-go-back-line me-1" />}
          Devolver
        </Button>
      </ModalFooter>
    </Modal>
  );
}
