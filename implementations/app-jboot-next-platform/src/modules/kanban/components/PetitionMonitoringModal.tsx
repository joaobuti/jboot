"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { kanbanApi, PetitionMonitoringOptionsDto, PetitionMonitoringSentDto } from "@/modules/kanban/lib/kanban-api";
import { describePetitionMonitoringError } from "@/modules/kanban/lib/petition-monitoring";

const NEW_BOARD = "__new__";
const COURT_LABEL = { jec: "JEC", jef: "JEF" } as const;

interface PetitionMonitoringModalProps {
  cardId: string | null;
  onClose: () => void;
  /** Envio concluido: o board recarrega a disponibilidade das acoes e os cards. */
  onSent: () => void;
}

/**
 * Acao Monitorar (docs/product/flow-card-actions-sprints.md, Sprint 2): cada peticao aprovada com numero
 * do processo vira card na coluna padrao do board de monitoramento escolhido, com acompanhamento DataJud
 * diario. Criar board novo aqui e so do administrador; o board nasce so com a coluna padrao.
 */
export default function PetitionMonitoringModal({ cardId, onClose, onSent }: PetitionMonitoringModalProps) {
  const [options, setOptions] = useState<PetitionMonitoringOptionsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [boardId, setBoardId] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; cardUrl: string | null } | null>(null);
  const [result, setResult] = useState<PetitionMonitoringSentDto | null>(null);

  useEffect(() => {
    if (!cardId) return;
    let active = true;
    setOptions(null);
    setResult(null);
    setError(null);
    setNewBoardName("");
    setLoading(true);
    kanbanApi.petitionMonitoring
      .options(cardId)
      .then((loaded) => {
        if (!active) return;
        setOptions(loaded);
        setSelected(loaded.petitions.map((petition) => petition.id));
        setBoardId(loaded.boards[0]?.id ?? (loaded.canCreateBoard ? NEW_BOARD : ""));
      })
      .catch((err) => { if (active) setError(describePetitionMonitoringError(err, "Erro ao carregar as petições")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cardId]);

  const creatingBoard = boardId === NEW_BOARD;
  const ready = Boolean(options?.monitoringEnabled) && selected.length > 0 && (creatingBoard ? newBoardName.trim().length > 0 : Boolean(boardId));

  function toggle(petitionId: string) {
    setSelected((current) => (current.includes(petitionId) ? current.filter((id) => id !== petitionId) : [...current, petitionId]));
  }

  async function handleSend() {
    if (!cardId || !options || !ready) return;
    setBusy(true);
    setError(null);
    try {
      let targetBoardId = boardId;
      if (creatingBoard) {
        const board = await kanbanApi.boards.create({ name: newBoardName.trim() });
        targetBoardId = board.id;
        // O board ja existe mesmo se o envio falhar; fica na lista para uma nova tentativa.
        setOptions({ ...options, boards: [...options.boards, { id: board.id, name: board.name }] });
        setBoardId(board.id);
      }
      setResult(await kanbanApi.petitionMonitoring.send(cardId, selected, targetBoardId));
      onSent();
    } catch (err) {
      setError(describePetitionMonitoringError(err, "Erro ao enviar para o monitoramento"));
    } finally {
      setBusy(false);
    }
  }

  const petitionName = (id: string) => options?.petitions.find((petition) => petition.id === id);

  return (
    <Modal isOpen={cardId !== null} toggle={busy ? undefined : onClose} centered>
      <ModalHeader toggle={busy ? undefined : onClose}>
        <i className="ri-radar-line me-1" />
        Monitorar processo
      </ModalHeader>
      <ModalBody>
        {loading && (
          <div className="text-muted small"><Spinner size="sm" className="me-1" />Carregando petições…</div>
        )}
        {options && !options.monitoringEnabled && (
          <Alert color="warning" className="small mb-0">Monitorar exige o Monitoramento processual contratado. Peça ao administrador.</Alert>
        )}
        {options && options.monitoringEnabled && options.petitions.length === 0 && !result && (
          <Alert color="info" className="small mb-0">
            Nenhuma petição aprovada com número do processo aguardando envio. Registre o número na seção Petições iniciais do card.
          </Alert>
        )}
        {options && options.monitoringEnabled && options.petitions.length > 0 && !result && (
          <>
            <div className="small fw-semibold mb-1">Petições</div>
            <ul className="list-unstyled small mb-3">
              {options.petitions.map((petition) => (
                <li key={petition.id} className="border rounded px-2 py-2 mb-1">
                  <div className="form-check mb-0">
                    <Input
                      id={`monitor-petition-${petition.id}`}
                      type="checkbox"
                      className="form-check-input"
                      checked={selected.includes(petition.id)}
                      disabled={busy}
                      onChange={() => toggle(petition.id)}
                    />
                    <Label className="form-check-label w-100" for={`monitor-petition-${petition.id}`}>
                      <span className="fw-medium">{petition.processNumber}</span>
                      <span className="text-muted"> · {COURT_LABEL[petition.court]} · {petition.bank}</span>
                      <div className="text-muted text-break">{petition.fileName}</div>
                    </Label>
                  </div>
                </li>
              ))}
            </ul>
            <FormGroup className="mb-2">
              <Label for="monitor-board">Board de monitoramento</Label>
              {options.boards.length === 0 && !options.canCreateBoard ? (
                <Alert color="warning" className="small mb-0">
                  Você não participa de nenhum outro board. Peça ao administrador para criar o board de monitoramento.
                </Alert>
              ) : (
                <Input id="monitor-board" type="select" value={boardId} disabled={busy} onChange={(event) => setBoardId(event.target.value)}>
                  {options.boards.map((board) => (
                    <option key={board.id} value={board.id}>{board.name}</option>
                  ))}
                  {options.canCreateBoard && <option value={NEW_BOARD}>+ Criar novo board</option>}
                </Input>
              )}
            </FormGroup>
            {creatingBoard && (
              <FormGroup className="mb-2">
                <Label for="monitor-new-board">Nome do novo board</Label>
                <Input
                  id="monitor-new-board"
                  maxLength={120}
                  value={newBoardName}
                  disabled={busy}
                  placeholder="Ex.: Monitoramento de ações"
                  onChange={(event) => setNewBoardName(event.target.value)}
                />
              </FormGroup>
            )}
            <p className="text-muted small mb-0">
              Cada petição vira um card na primeira coluna do board escolhido, ligado ao cliente, com consulta diária no DataJud.
              Movimentações novas aparecem no histórico do card. O card de origem continua onde está.
            </p>
          </>
        )}
        {error && (
          <Alert color="danger" className="small mt-3 mb-0">
            {error.message}
            {error.cardUrl && <> <a href={error.cardUrl}>Abrir card</a></>}
          </Alert>
        )}
        {result && (
          <Alert color="success" className="small mb-0">
            <div className="fw-medium mb-1">Enviado para o monitoramento.</div>
            <ul className="mb-0 ps-3">
              {result.sent.map((item) => (
                <li key={item.petitionId}>
                  {petitionName(item.petitionId)?.processNumber ?? "Petição"}: card {item.created ? "criado" : "já existente"}.{" "}
                  <a href={item.cardUrl}>Abrir card</a>
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        {!result && (
          <Button color="primary" disabled={!ready || busy} onClick={() => void handleSend()}>
            {busy && <Spinner size="sm" className="me-1" />}
            Enviar para monitoramento
          </Button>
        )}
        <Button color="light" onClick={onClose} disabled={busy}>
          Fechar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
