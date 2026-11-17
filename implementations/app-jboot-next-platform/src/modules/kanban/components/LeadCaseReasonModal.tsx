"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { AnalysisCaseTypeOptionDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { ANALYSIS_REASON_MAX, ANALYSIS_REASON_MIN, validateAnalysisReason } from "@/modules/kanban/lib/lead-analysis";

interface LeadCaseReasonModalProps {
  isOpen: boolean;
  mode: "change" | "remove";
  caseTypeName: string;
  /** Opcoes para a troca (sem o tipo atual nem os ja usados). */
  options: AnalysisCaseTypeOptionDto[];
  onClose: () => void;
  onConfirm: (reason: string, caseTypeId: string | null) => Promise<void>;
}

/**
 * Troca ou remocao auditada do caso (Sprint 6): mesmo padrao do motivo da
 * devolucao (S4) e da transferencia de escritorio (S3.5). O motivo vai para o
 * historico do gestor e a auditoria; os documentos do caso deixam de valer.
 */
export default function LeadCaseReasonModal({ isOpen, mode, caseTypeName, options, onClose, onConfirm }: LeadCaseReasonModalProps) {
  const [reason, setReason] = useState("");
  const [caseTypeId, setCaseTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setCaseTypeId("");
      setError(null);
    }
  }, [isOpen]);

  const reasonError = validateAnalysisReason(reason);
  const typeMissing = mode === "change" && !caseTypeId;

  async function handleConfirm() {
    if (reasonError || typeMissing) {
      setError(reasonError ?? "Escolha o novo tipo de caso.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), mode === "change" ? caseTypeId : null);
      onClose();
    } catch (err) {
      setError(describeKanbanError(err, mode === "change" ? "Erro ao trocar o tipo de caso" : "Erro ao remover o caso"));
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "change" ? "Trocar tipo de caso" : "Remover caso";
  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>
        <i className={`${mode === "change" ? "ri-exchange-line" : "ri-delete-bin-line"} me-1`} />
        {title}
      </ModalHeader>
      <ModalBody>
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}
        <p className="small text-muted">
          Caso atual: <strong>{caseTypeName}</strong>. Os documentos deste caso deixam de valer (inclusive o aprovado, que sai da
          entrega ao escritório). <strong>A ação é auditada.</strong>
        </p>
        {mode === "change" && (
          <FormGroup>
            <Label for="lead-case-type">
              Novo tipo de caso<span className="text-danger ms-1">*</span>
            </Label>
            <Input
              id="lead-case-type"
              type="select"
              value={caseTypeId}
              onChange={(event) => setCaseTypeId(event.target.value)}
              disabled={saving}
            >
              <option value="">Selecione</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Input>
          </FormGroup>
        )}
        <FormGroup className="mb-0">
          <Label for="lead-case-reason">
            Motivo<span className="text-danger ms-1">*</span>
          </Label>
          <Input
            id="lead-case-reason"
            type="textarea"
            rows={3}
            maxLength={ANALYSIS_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={saving}
            placeholder="Ex.: documentos indicam outro tipo de caso"
          />
          <div className="d-flex justify-content-between text-muted small mt-1">
            <span>Mínimo de {ANALYSIS_REASON_MIN} caracteres. Não inclua CPF ou dado pessoal.</span>
            <span>
              {reason.trim().length}/{ANALYSIS_REASON_MAX}
            </span>
          </div>
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="light" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          color={mode === "change" ? "primary" : "danger"}
          onClick={() => void handleConfirm()}
          disabled={saving || reasonError !== null || typeMissing}
        >
          {saving ? <Spinner size="sm" className="me-1" /> : null}
          {mode === "change" ? "Trocar" : "Remover"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
