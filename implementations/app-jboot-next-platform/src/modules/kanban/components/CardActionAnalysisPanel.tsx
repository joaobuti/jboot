"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge } from "reactstrap";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { ActionAnalysisDto, InitialPetitionsRunDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { actionPetitionLinks } from "@/modules/kanban/lib/initial-petitions";
import {
  ACTION_BLOCK_TITLES,
  analysisCompletionText,
  actionSummary,
  contractLabel,
  groupActionsByBlock,
} from "@/modules/kanban/lib/action-analysis";
import { formatLeadDate } from "@/modules/kanban/lib/leads";

interface CardActionAnalysisPanelProps {
  boardId: string;
  cardId: string;
  reloadKey?: number;
}

const TONE_CLASS = { success: "text-success", muted: "text-muted", warning: "text-warning" } as const;

/**
 * Acoes identificadas pela Analise de Acoes (flow-action-analysis-sprints.md, A1): cada linha
 * "Acao" de um bloco e uma peticao inicial possivel. Somente leitura; sem analise, nada aparece.
 */
export default function CardActionAnalysisPanel({ boardId, cardId, reloadKey = 0 }: CardActionAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ActionAnalysisDto | null>(null);
  const [petitions, setPetitions] = useState<InitialPetitionsRunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [latest, petitionRun] = await Promise.all([
        kanbanApi.actionAnalysis.latest(boardId, cardId),
        // Vinculo com as peticoes (ADR 020, S5): sem execucao de peticoes, nada muda na secao.
        kanbanApi.initialPetitions.latest(boardId, cardId).catch(() => ({ run: null })),
      ]);
      setAnalysis(latest.analysis);
      setPetitions(petitionRun.run);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar a análise de ações"));
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (loading) return null;
  if (!analysis) {
    return error ? <Alert color="danger" className="small">{error}</Alert> : null;
  }

  const outcome = analysisCompletionText(analysis);
  const links = actionPetitionLinks(petitions, analysis.id);
  return (
    <div className="mb-3 pb-3 border-bottom">
      <h6 className="text-muted mb-2 d-flex align-items-center gap-2">
        <span>
          <i className="ri-scales-3-line me-1" />
          Ações identificadas
        </span>
        {analysis.status === "concluida" && <Badge color="primary" pill>{analysis.actionCount}</Badge>}
      </h6>
      <div className="small text-muted mb-2">
        Análise de {formatLeadDate(analysis.createdAt)}
        {analysis.holderName && ` · ${analysis.holderName}`}
        {analysis.benefitNumber && ` · benefício ${analysis.benefitNumber}`}
        {analysis.statementDate && ` · extrato de ${analysis.statementDate}`}
      </div>
      {analysis.status === "nao_concluida" && (
        <Alert color="warning" className="small py-2 mb-2">
          <i className="ri-error-warning-line me-1" />
          {analysis.failureReason}
        </Alert>
      )}
      <div className={`small mb-2 ${TONE_CLASS[outcome.tone]}`}>{outcome.text}</div>
      {groupActionsByBlock(analysis.actions).map((group) => (
        <div key={group.block} className="mb-2">
          <div className="small fw-semibold mb-1">
            {ACTION_BLOCK_TITLES[group.block]} ({group.actions.length})
          </div>
          <ul className="list-unstyled small mb-0">
            {group.actions.map((action) => (
              <li key={action.id} className="border rounded px-2 py-1 mb-1">
                <div>
                  <span className="fw-medium">Ação {action.position}</span>
                  <span className="text-muted"> · {actionSummary(action)}</span>
                </div>
                <div className="text-muted text-break">
                  {action.contracts.map(contractLabel).join("; ")}
                  {action.rootContract && ` · contrato-raiz ${action.rootContract}`}
                </div>
                {action.observations && <div className="fst-italic text-muted text-break">{action.observations}</div>}
                {(() => {
                  const link = links.get(action.id);
                  if (!link) return null;
                  return "fileName" in link ? (
                    <div className="text-success text-break"><i className="ri-file-word-2-line me-1" />Virou a petição {link.fileName}</div>
                  ) : (
                    <div className="text-warning text-break"><i className="ri-error-warning-line me-1" />Sem petição: {link.reason}</div>
                  );
                })()}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
