"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { CorrectedPetitionResultDto, InitialPetitionDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { TEMPLATE_ACCEPT, validateTemplateFile } from "@/modules/kanban/lib/document-templates";

interface CorrectedPetitionModalProps {
  boardId: string;
  cardId: string;
  petition: InitialPetitionDto | null;
  onClose: () => void;
  onUploaded: (result: CorrectedPetitionResultDto) => void;
}

/**
 * Versao corrigida da peticao (S8 de docs/product/flow-initial-petitions-sprints.md): a pessoa baixou a
 * peca, corrigiu no Word e envia o `.docx`. A corrigida volta a pendente de aprovacao; aprovada,
 * substitui o arquivo da peticao no Drive. A seguranca do arquivo e do backend; aqui so extensao e tamanho.
 */
export default function CorrectedPetitionModal({ boardId, cardId, petition, onClose, onUploaded }: CorrectedPetitionModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (petition) {
      setFile(null);
      setError(null);
    }
  }, [petition]);

  const fileError = file ? validateTemplateFile(file) : null;
  const approved = petition?.document?.status === "aprovado";

  async function handleUpload() {
    if (!petition?.document) return;
    if (!file || fileError) {
      setError(fileError ?? "Escolha o arquivo .docx corrigido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onUploaded(await kanbanApi.initialPetitions.uploadCorrected(boardId, cardId, petition.document.documentId, file));
      onClose();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao enviar a versão corrigida"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={petition !== null} toggle={saving ? undefined : onClose} centered>
      <ModalHeader toggle={saving ? undefined : onClose}>
        <i className="ri-file-upload-line me-1" />
        Enviar versão corrigida
      </ModalHeader>
      <ModalBody>
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}
        {petition && (
          <Alert color="warning" className="small">
            <i className="ri-information-line me-1" />
            A versão enviada substitui <strong>{petition.fileName}</strong> e volta para <strong>pendente de aprovação</strong>.
            {approved
              ? " Ao aprovar de novo, ela substitui o arquivo da petição no Google Drive."
              : " Depois de aprovada, vai para a pasta do cliente no Google Drive."}{" "}
            A versão anterior fica no histórico.
          </Alert>
        )}
        <FormGroup className="mb-0">
          <Label for="corrected-petition-file">
            Arquivo corrigido (.docx, até 10 MB)<span className="text-danger ms-1">*</span>
          </Label>
          <Input
            id="corrected-petition-file"
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
          {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-2-line me-1" />}
          Enviar corrigida
        </Button>
      </ModalFooter>
    </Modal>
  );
}
