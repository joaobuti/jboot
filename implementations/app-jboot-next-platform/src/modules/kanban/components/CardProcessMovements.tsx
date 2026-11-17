"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Spinner } from "reactstrap";
import { CardProcessMovementDto, CardPublicationDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { djenErrorMessage } from "@/modules/kanban/lib/djen-control";
import { formatMovementDate, lookupEmptyMessage, movementsSummary, PROCESS_MOVEMENTS_PREVIEW, visibleMovements } from "@/modules/kanban/lib/process-movements";

interface CardProcessMovementsProps {
  cardId: string;
  /** Cliente com Publicacoes processuais (DJEN): mostra "Ver no DJEN" (Sprint 9). */
  djenAvailable?: boolean;
}

type Lookup = { loading: true } | { loading: false; error: string } | { loading: false; from: string; to: string; items: CardPublicationDto[] };

/**
 * Movimentacoes do processo do card monitorado (docs/product/process-monitoring-sprints.md, Sprint 5).
 * Somente leitura: mostra o historico que o processo ja tinha no DataJud e as movimentacoes novas
 * (marcadas). Nao entra no historico do card nem dispara automacao; so as novas fazem isso, pelo
 * acompanhamento.
 */
export default function CardProcessMovements({ cardId, djenAvailable = false }: CardProcessMovementsProps) {
  const [items, setItems] = useState<CardProcessMovementDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});

  async function lookup(movementId: string) {
    setLookups((current) => ({ ...current, [movementId]: { loading: true } }));
    try {
      const result = await kanbanApi.sourceMonitoring.lookupMovementPublications(cardId, movementId);
      setLookups((current) => ({ ...current, [movementId]: { loading: false, ...result } }));
    } catch (failure) {
      setLookups((current) => ({ ...current, [movementId]: { loading: false, error: djenErrorMessage(failure) } }));
    }
  }

  useEffect(() => {
    let active = true;
    kanbanApi.sourceMonitoring
      .movements(cardId)
      .then((result) => { if (active) setItems(result.items); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [cardId]);

  if (failed) return <p className="text-muted small mb-0 mt-2">Não foi possível carregar as movimentações do processo.</p>;
  if (!items) return <Spinner size="sm" className="mt-2" />;
  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <h6 className="text-muted mb-1">Movimentações do processo</h6>
      <p className="text-muted small mb-2">{movementsSummary(items)}</p>
      <ul className="list-unstyled small mb-1">
        {visibleMovements(items, expanded).map((item) => {
          const found = lookups[item.id];
          return (
            <li key={item.id} className="py-1 border-bottom border-light">
              <div className="d-flex gap-2">
                <span className="text-muted text-nowrap">{formatMovementDate(item.occurredAt)}</span>
                <span className="flex-grow-1">{item.description}</span>
                {item.isNew && <Badge color="success" className="align-self-start">Nova</Badge>}
                {djenAvailable && item.djenLookup && !found && (
                  <Button color="link" size="sm" className="p-0 align-self-start text-nowrap" onClick={() => void lookup(item.id)}>
                    Ver no DJEN
                  </Button>
                )}
              </div>
              {found?.loading && <Spinner size="sm" className="ms-1 mt-1" />}
              {found && !found.loading && "error" in found && <p className="text-danger small mb-0 mt-1">{found.error}</p>}
              {found && !found.loading && "items" in found && (
                found.items.length === 0 ? (
                  <p className="text-muted small mb-0 mt-1">{lookupEmptyMessage(found.from, found.to)}</p>
                ) : (
                  <div className="mt-1 ps-2 border-start">
                    {found.items.map((publication) => (
                      <div key={publication.id} className="mb-2">
                        <div className="text-muted">
                          {formatMovementDate(publication.availableOn)} · {[publication.communicationType, publication.documentType].filter(Boolean).join(" · ") || "Comunicação"}
                          <Badge color="secondary" className="ms-1">DJEN</Badge>
                        </div>
                        <p className="mb-0" style={{ whiteSpace: "pre-line" }}>{publication.text}</p>
                      </div>
                    ))}
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
      {items.length > PROCESS_MOVEMENTS_PREVIEW && (
        <Button color="link" size="sm" className="p-0" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Mostrar menos" : `Ver todas (${items.length})`}
        </Button>
      )}
    </div>
  );
}
