"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { InitialPetitionDto, InitialPetitionsLatestDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describePetitionMonitoringError, formatCnjInput, isValidCnjInput, normalizeCnjInput } from "@/modules/kanban/lib/petition-monitoring";

interface RegisterProcessNumberModalProps {
  boardId: string;
  cardId: string;
  petition: InitialPetitionDto | null;
  onClose: () => void;
  onRegistered: (result: InitialPetitionsLatestDto) => void;
}

/**
 * Numero do processo (CNJ) da peticao aprovada, informado depois do protocolo manual no portal
 * (docs/product/flow-card-actions-sprints.md, Sprint 2). Nesta versao o numero nao pode ser corrigido
 * depois de registrado; a tela avisa antes de confirmar.
 */
export default function RegisterProcessNumberModal({ boardId, cardId, petition, onClose, onRegistered }: RegisterProcessNumberModalProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; cardUrl: string | null } | null>(null);

  useEffect(() => {
    if (petition) {
      setValue("");
      setError(null);
    }
  }, [petition]);

  const complete = normalizeCnjInput(value).length === 20;
  const invalid = complete && !isValidCnjInput(value);

  async function handleSave() {
    if (!petition || !complete || invalid) return;
    setSaving(true);
    setError(null);
    try {
      onRegistered(await kanbanApi.initialPetitions.registerProtocol(boardId, cardId, petition.id, normalizeCnjInput(value)));
      onClose();
    } catch (err) {
      setError(describePetitionMonitoringError(err, "Erro ao registrar o número do processo"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={petition !== null} toggle={saving ? undefined : onClose} centered>
      <ModalHeader toggle={saving ? undefined : onClose}>
        <i className="ri-hashtag me-1" />
        Registrar número do processo
      </ModalHeader>
      <ModalBody>
        {petition && (
          <div className="mb-3">
            <div className="text-muted small">Petição</div>
            <div className="fw-medium text-break">{petition.fileName}</div>
            <div className="text-muted small">{petition.bank}</div>
          </div>
        )}
        <FormGroup className="mb-2">
          <Label for="petition-process-number">Número do processo (CNJ)</Label>
          <Input
            id="petition-process-number"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0000000-00.0000.0.00.0000"
            value={value}
            invalid={invalid}
            disabled={saving}
            onChange={(event) => setValue(formatCnjInput(event.target.value))}
            onKeyDown={(event) => { if (event.key === "Enter") void handleSave(); }}
          />
          <FormFeedback>Dígito verificador não confere. Confira o número no portal.</FormFeedback>
        </FormGroup>
        <p className="text-muted small mb-0">
          Use o número gerado no protocolo da petição. Depois de registrado, o número não pode ser alterado por esta tela.
        </p>
        {error && (
          <Alert color="danger" className="small mt-3 mb-0">
            {error.message}
            {error.cardUrl && <> <a href={error.cardUrl}>Abrir card</a></>}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="primary" disabled={!complete || invalid || saving} onClick={() => void handleSave()}>
          {saving && <Spinner size="sm" className="me-1" />}
          Registrar
        </Button>
        <Button color="light" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
