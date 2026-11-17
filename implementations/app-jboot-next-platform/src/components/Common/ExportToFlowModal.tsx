"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";

export interface ExportToFlowBoardOption {
  id: string;
  name: string;
}

export interface ExportToFlowOfficeOption {
  id: string;
  name: string;
}

export interface ExportToFlowResult {
  cardUrl: string;
  created: boolean;
}

interface ExportToFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Linha de identificação do registro sendo exportado (ex: número do processo). */
  subject: { label: string; value: string } | null;
  boards: ExportToFlowBoardOption[];
  /** Escritorios em que o usuario pode criar card no Flow; o card exige um. */
  offices: ExportToFlowOfficeOption[];
  onExport: (boardId: string, officeId: string) => Promise<ExportToFlowResult>;
  /**
   * Andamento de um export longo (ex: lote que precisa buscar o detalhe de cada
   * processo antes de exportar). Sem isso, o usuário veria só um spinner por
   * dezenas de segundos.
   */
  progressLabel?: string | null;
}

/**
 * Seleção de board e resultado do export para o Flow, compartilhado entre as
 * origens do módulo Jurídico (PJe/DJEN e DataJud).
 *
 * Recebe `boards` e `onExport` por prop de propósito: o componente é
 * apresentacional e não importa cliente de API de módulo nenhum, mantendo a
 * regra de não acoplar frontends de módulos diferentes.
 */
export default function ExportToFlowModal({ isOpen, onClose, subject, boards, offices, onExport, progressLabel }: ExportToFlowModalProps) {
  const [boardId, setBoardId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportToFlowResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBoardId(boards[0]?.id ?? "");
    setOfficeId(offices.length === 1 ? offices[0].id : "");
    setError(null);
    setResult(null);
  }, [isOpen, boards, offices]);

  async function handleExport() {
    if (!boardId || !officeId) return;
    setExporting(true);
    setError(null);
    try {
      setResult(await onExport(boardId, officeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível exportar para o Flow.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>Exportar para o Flow</ModalHeader>
      <ModalBody>
        {subject && (
          <div className="mb-3">
            <div className="text-muted small">{subject.label}</div>
            <div className="fw-medium">{subject.value}</div>
          </div>
        )}
        <div className="mb-3">
          <label className="form-label" htmlFor="flow-board-destino">
            Board destino
          </label>
          <Input
            id="flow-board-destino"
            type="select"
            value={boardId}
            onChange={(event) => setBoardId(event.target.value)}
            disabled={exporting || result !== null}
          >
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </Input>
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="flow-office-destino">
            Escritório *
          </label>
          {offices.length === 0 ? (
            <Alert color="warning" className="mb-0">
              Você não tem escritório ativo no Flow. Peça ao gestor para vincular você a um escritório.
            </Alert>
          ) : (
            <Input
              id="flow-office-destino"
              type="select"
              value={officeId}
              onChange={(event) => setOfficeId(event.target.value)}
              disabled={exporting || result !== null}
            >
              {offices.length > 1 && <option value="">Selecione o escritório</option>}
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </Input>
          )}
        </div>
        <p className="text-muted small mb-0">
          O card guarda uma cópia dos dados no momento do export. Alterações posteriores no processo
          aparecem no histórico do card, sem reescrever o conteúdo original.
        </p>
        {exporting && progressLabel && (
          <p className="text-muted small mt-3 mb-0" aria-live="polite">{progressLabel}</p>
        )}
        {error && <Alert color="danger" className="mt-3 mb-0">{error}</Alert>}
        {result && (
          <Alert color="success" className="mt-3 mb-0">
            Card {result.created ? "criado" : "já existente"} no Flow.{" "}
            <a href={result.cardUrl}>Abrir card</a>
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="primary" disabled={!boardId || !officeId || exporting || result !== null} onClick={() => void handleExport()}>
          {exporting && <Spinner size="sm" className="me-1" />}
          Exportar
        </Button>
        <Button color="light" onClick={onClose} disabled={exporting}>
          Fechar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
