"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Spinner } from "reactstrap";
import { CardPublicationDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { formatMovementDate } from "@/modules/kanban/lib/process-movements";

interface CardPublicationsProps {
  cardId: string;
  /** DJEN ligado no card: so entao a lista vazia mostra aviso. */
  djenEnabled: boolean;
}

const PREVIEW = 3;

/**
 * Publicacoes e intimacoes do DJEN do card (ADR 022), separadas das movimentacoes do DataJud. Texto puro
 * vindo do BFF (nunca HTML do provedor), recolhido por padrao. As novas tambem entram no historico.
 */
export default function CardPublications({ cardId, djenEnabled }: CardPublicationsProps) {
  const [items, setItems] = useState<CardPublicationDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    kanbanApi.sourceMonitoring
      .publications(cardId)
      .then((result) => { if (active) setItems(result.items); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [cardId]);

  if (failed) return <p className="text-muted small mb-0 mt-2">Não foi possível carregar as publicações do DJEN.</p>;
  if (!items) return <Spinner size="sm" className="mt-2" />;
  if (items.length === 0) {
    if (!djenEnabled) return null;
    return (
      <div className="mt-3">
        <h6 className="text-muted mb-1">
          Publicações e intimações <Badge color="secondary" className="ms-1">DJEN</Badge>
        </h6>
        <p className="text-muted small mb-0">
          Nenhuma publicação encontrada no DJEN desde o início do acompanhamento (a primeira busca cobre os últimos 7 dias).
        </p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, PREVIEW);
  const toggleItem = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-3">
      <h6 className="text-muted mb-1">
        Publicações e intimações <Badge color="secondary" className="ms-1">DJEN</Badge>
      </h6>
      <ul className="list-unstyled small mb-1">
        {visible.map((item) => {
          const isOpen = open.has(item.id);
          const header = [item.communicationType, item.documentType].filter(Boolean).join(" · ");
          return (
            <li key={item.id} className="py-2 border-bottom border-light">
              <div className="d-flex gap-2 align-items-start">
                <span className="text-muted text-nowrap">{formatMovementDate(item.availableOn)}</span>
                <span className="flex-grow-1">
                  {header || "Comunicação"}
                  {item.courtName && <span className="text-muted"> — {item.courtName}</span>}
                </span>
                {item.isNew && <Badge color="success">Nova</Badge>}
              </div>
              {item.text && (
                <>
                  <p className="mb-1 mt-1" style={{ whiteSpace: "pre-line" }}>
                    {isOpen ? item.text : `${item.text.slice(0, 240)}${item.text.length > 240 ? "…" : ""}`}
                  </p>
                  {item.text.length > 240 && (
                    <Button color="link" size="sm" className="p-0" onClick={() => toggleItem(item.id)}>
                      {isOpen ? "Recolher texto" : "Ler texto completo"}
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > PREVIEW && (
        <Button color="link" size="sm" className="p-0" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Mostrar menos" : `Ver todas (${items.length})`}
        </Button>
      )}
    </div>
  );
}
