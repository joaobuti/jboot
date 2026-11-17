"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { EditedVersionResultDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { TEMPLATE_ACCEPT, validateTemplateFile } from "@/modules/kanban/lib/document-templates";

interface LeadDocumentUploadModalProps {
  isOpen: boolean;
  boardId: string;
  cardId: string;
  documentId: string;
  documentLabel: string;
  onClose: () => void;
  onUploaded: (result: EditedVersionResultDto) => void;
}

/**
 * Substituir por versao editada (Sprint 6): o gestor baixou o documento, editou
 * no Word e envia o `.docx` revisado. A versao enviada vira o documento
 * APROVADO entregue ao escritorio (com PDF novo); nao exige variaveis. A
 * seguranca do arquivo (tamanho, assinatura, macro, objeto embutido, vinculo
 * externo) e do backend; aqui so a pre-validacao de extensao e tamanho.
 */
export default function LeadDocumentUploadModal({
  isOpen,
  boardId,
  cardId,
  documentId,
  documentLabel,
  onClose,
  onUploaded,
}: LeadDocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setError(null);
    }
  }, [isOpen]);

  const fileError = file ? validateTemplateFile(file) : null;

  async function handleUpload() {
    if (!file || fileError) {
      setError(fileError ?? "Escolha o arquivo .docx revisado.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onUploaded(await kanbanApi.leadAnalysis.uploadEditedVersion(boardId, cardId, documentId, file));
      onClose();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao enviar a versão editada"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>
        <i className="ri-file-upload-line me-1" />
        Substituir por versão editada
      </ModalHeader>
      <ModalBody>
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Alert color="warning" className="small">
          <i className="ri-information-line me-1" />
          A versão enviada substitui <strong>{documentLabel}</strong> e passa a ser o documento <strong>aprovado</strong>, entregue
          ao escritório em .docx e PDF. As versões anteriores ficam no histórico.
        </Alert>
        <FormGroup className="mb-0">
          <Label for="lead-edited-file">
            Arquivo revisado (.docx, até 10 MB)<span className="text-danger ms-1">*</span>
          </Label>
          <Input
            id="lead-edited-file"
            type="file"
            accept={TEMPLATE_ACCEPT}
            disabled={saving}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {fileError && <div className="text-danger small mt-1">{fileError}</div>}
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="light" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={() => void handleUpload()} disabled={saving || !file || fileError !== null}>
          {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-check-double-line me-1" />}
          Enviar e aprovar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
