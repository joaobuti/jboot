"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Spinner } from "reactstrap";
import { CardMonitoringDto, KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { isMonitoredSourceType } from "@/modules/kanban/lib/card-actions";
import { describeMonitoringCheck } from "@/modules/kanban/lib/monitoring-check";
import { processDetailsLine } from "@/modules/kanban/lib/process-movements";
import CardProcessMovements from "@/modules/kanban/components/CardProcessMovements";
import CardPublications from "@/modules/kanban/components/CardPublications";

interface CardSourceMonitoringPanelProps {
  cardId: string;
  sourceType: string | null;
  sourceUrl: string | null;
}

/**
 * Somente leitura: o painel mostra o estado do acompanhamento DataJud e o
 * link para a consulta original. Ligar/desligar e ajustar a cadencia sao
 * acoes no cabecalho do card (`CardMonitoringToggle` +
 * `CardMonitoringCadenceControl`), lado a lado por serem o mesmo assunto.
 *
 * O acompanhamento é da capacidade `monitoramento-processual` (ADR 021),
 * com destino neste card: não depende do Jurídico. Mudanças detectadas entram
 * no histórico do card, sem reescrever os dados originais. Só o card exportado
 * do DataJud usa o Jurídico, para achar a consulta de origem.
 */
export default function CardSourceMonitoringPanel({ cardId, sourceType, sourceUrl }: CardSourceMonitoringPanelProps) {
  const [state, setState] = useState<CardMonitoringDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Card exportado do DataJud ou card de monitoramento de peticao (Sprint 2 de flow-card-actions).
  const isDataJudCard = isMonitoredSourceType(sourceType);
  const isPetitionCard = sourceType === "flow_petition";
  const isImportedCard = sourceType === "flow_process_import";

  const request = useCallback(async () => {
    try {
      return await kanbanApi.sourceMonitoring.get(cardId);
    } catch (error) {
      if (error instanceof KanbanApiError && error.status === 403) setForbidden(true);
      return null;
    }
  }, [cardId]);

  useEffect(() => {
    if (!isDataJudCard) {
      setLoading(false);
      return;
    }
    let active = true;
    request()
      .then((result) => { if (active && result) setState(result); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isDataJudCard, request]);

  if (!isDataJudCard) return null;

  return (
    <div className="mb-3">
      <h6 className="text-muted mb-2">
        Origem <Badge color="info">{isPetitionCard ? "Petição protocolada" : isImportedCard ? "Planilha importada" : "DataJud"}</Badge>
      </h6>
      {loading ? (
        <Spinner size="sm" />
      ) : forbidden ? (
        <p className="text-muted small mb-0">
          Você não tem permissão para ver o monitoramento deste card.
        </p>
      ) : state?.hasSource === false ? (
        <p className="text-muted small mb-0">
          {isPetitionCard || isImportedCard
            ? "Este card não tem acompanhamento de movimentações."
            : "A origem deste card não está mais vinculada a uma consulta do Jurídico."}
        </p>
      ) : (
        <p className="text-muted small mb-0">
          {state?.monitoring
            ? "Consulta ao DataJud ativa (controle no cabeçalho do card). Novas movimentações aparecem no histórico deste card, sem alterar os dados originais."
            : isPetitionCard || isImportedCard
              ? "Consulta ao DataJud pausada. Ative no cabeçalho do card."
              : "Sem monitoramento, o card mantém os dados do momento do export. Ative no cabeçalho do card."}
        </p>
      )}
      {!loading && !forbidden && processDetailsLine(state?.process) && (
        <p className="small mb-1">{processDetailsLine(state?.process)}</p>
      )}
      {!loading && !forbidden && state &&
        describeMonitoringCheck(state)?.map((line) => (
          <p key={line.text} className={`small mb-0 ${line.tone === "success" ? "text-success" : line.tone === "warning" ? "text-warning" : "text-muted"}`}>
            {line.text}
          </p>
        ))}
      {!loading && !forbidden && state?.monitorId && state.djen?.available && <CardPublications cardId={cardId} djenEnabled={state.djen.enabled} />}
      {!loading && !forbidden && state?.monitorId && (
        <CardProcessMovements cardId={cardId} djenAvailable={Boolean(state.djen?.available)} />
      )}
      {sourceUrl && (
        <a className="small" href={sourceUrl}>
          {isPetitionCard ? "Abrir card de origem" : "Abrir consulta no Jurídico"}
        </a>
      )}
    </div>
  );
}
