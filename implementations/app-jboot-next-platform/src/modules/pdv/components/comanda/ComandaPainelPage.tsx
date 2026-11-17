"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Col, Row } from "reactstrap";
import { ComandaAdminItem, comandaAdminApi } from "@/modules/pdv/lib/comanda-admin-api";
import { ComandaQueueList } from "./ComandaQueueList";

interface SectionState {
  items: ComandaAdminItem[];
  error: string | null;
}

const EMPTY_SECTION: SectionState = { items: [], error: null };

async function loadSection(fetcher: () => Promise<ComandaAdminItem[]>): Promise<SectionState> {
  try {
    return { items: await fetcher(), error: null };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : "Erro ao carregar" };
  }
}

export function ComandaPainelPage() {
  const [pendentes, setPendentes] = useState<SectionState>(EMPTY_SECTION);
  const [cozinha, setCozinha] = useState<SectionState>(EMPTY_SECTION);
  const [bar, setBar] = useState<SectionState>(EMPTY_SECTION);
  const [prontos, setProntos] = useState<SectionState>(EMPTY_SECTION);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [pendentesResult, cozinhaResult, barResult, prontosResult] = await Promise.all([
      loadSection(() => comandaAdminApi.itensPendentes()),
      loadSection(() => comandaAdminApi.fila("cozinha")),
      loadSection(() => comandaAdminApi.fila("bar")),
      loadSection(() => comandaAdminApi.itensProntos())
    ]);
    setPendentes(pendentesResult);
    setCozinha(cozinhaResult);
    setBar(barResult);
    setProntos(prontosResult);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="page-content">
      <h5 className="mb-3">
        <i className="ri-tv-2-line me-2" />
        Painel de Acompanhamento — Comanda
      </h5>

      <Row className="g-3">
        <Col md={6} xl={3}>
          <ComandaQueueList
            title="Aguardando"
            icon="ri-time-line"
            items={pendentes.items}
            loading={loading}
            error={pendentes.error}
            emptyIcon="ri-inbox-line"
            emptyMessage="Nenhum item aguardando."
            showPosition
          />
        </Col>
        <Col md={6} xl={3}>
          <ComandaQueueList
            title="Cozinha"
            icon="ri-restaurant-2-line"
            items={cozinha.items}
            loading={loading}
            error={cozinha.error}
            emptyIcon="ri-restaurant-2-line"
            emptyMessage="Nenhum item em produção na cozinha."
            showPosition
            timestampField="encaminhadoAt"
            timestampLabel="Encaminhado às"
          />
        </Col>
        <Col md={6} xl={3}>
          <ComandaQueueList
            title="Bar"
            icon="ri-goblet-line"
            items={bar.items}
            loading={loading}
            error={bar.error}
            emptyIcon="ri-goblet-line"
            emptyMessage="Nenhum item em produção no bar."
            showPosition
            timestampField="encaminhadoAt"
            timestampLabel="Encaminhado às"
          />
        </Col>
        <Col md={6} xl={3}>
          <ComandaQueueList
            title="Pronto — aguardando liberação"
            icon="ri-checkbox-circle-line"
            items={prontos.items}
            loading={loading}
            error={prontos.error}
            emptyIcon="ri-checkbox-circle-line"
            emptyMessage="Nenhum item pronto aguardando liberação."
            timestampField="finalizadoAt"
            timestampLabel="Finalizado às"
          />
        </Col>
      </Row>
    </div>
  );
}
