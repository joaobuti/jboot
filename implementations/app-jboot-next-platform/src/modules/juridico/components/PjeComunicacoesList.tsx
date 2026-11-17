"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import ExportToFlowModal from "@/components/Common/ExportToFlowModal";
import {
  FlowBoardOption,
  FlowOfficeOption,
  juridicoApi,
  PjeComunicacao,
  PjeComunicacoesFilter,
} from "@/modules/juridico/lib/juridico-api";

const PAGE_SIZE = 20;

function formatProcesso(item: PjeComunicacao): string {
  return item.numeroProcessoMask ?? item.numeroProcesso ?? "—";
}

/**
 * O DJEN devolve o teor ora em texto puro, ora em HTML completo (com head/style).
 * Convertemos para texto em vez de renderizar o markup: conteúdo de terceiros
 * nunca é injetado como HTML na tela.
 */
function textoParaExibicao(texto: string | null): string {
  if (!texto) {
    return "Sem teor disponível.";
  }
  if (!/<[a-z!/][\s\S]*>/i.test(texto)) {
    return texto;
  }
  return texto
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatData(value: string | null): string {
  if (!value) return "—";
  const [ano, mes, dia] = value.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : value;
}

interface Props {
  reloadToken?: number;
}

export default function PjeComunicacoesList({ reloadToken = 0 }: Props) {
  const [items, setItems] = useState<PjeComunicacao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PjeComunicacao | null>(null);
  const [flowEnabled, setFlowEnabled] = useState(false);
  const [flowBoards, setFlowBoards] = useState<FlowBoardOption[]>([]);
  const [flowOffices, setFlowOffices] = useState<FlowOfficeOption[]>([]);
  const [flowLoading, setFlowLoading] = useState(true);
  const [exportItem, setExportItem] = useState<PjeComunicacao | null>(null);

  const [filtroTribunal, setFiltroTribunal] = useState("");
  const [filtroProcesso, setFiltroProcesso] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroAplicado, setFiltroAplicado] = useState<PjeComunicacoesFilter>({});

  const load = useCallback(
    async (targetPage: number, filter: PjeComunicacoesFilter) => {
      try {
        setLoading(true);
        setError(null);
        const result = await juridicoApi.pje.listComunicacoes({
          ...filter,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        setItems(result.items);
        setTotal(result.total);
        setPage(result.page);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar comunicações");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(1, filtroAplicado);
  }, [load, filtroAplicado, reloadToken]);

  useEffect(() => {
    let mounted = true;
    async function loadFlowBoards() {
      try {
        setFlowLoading(true);
        const result = await juridicoApi.domainIntegrations.listFlowBoards();
        if (!mounted) return;
        setFlowEnabled(result.flowEnabled);
        setFlowBoards(result.boards);
        setFlowOffices(result.offices);
      } catch {
        if (!mounted) return;
        setFlowEnabled(false);
        setFlowBoards([]);
        setFlowOffices([]);
      } finally {
        if (mounted) {
          setFlowLoading(false);
        }
      }
    }

    void loadFlowBoards();
    return () => {
      mounted = false;
    };
  }, []);

  const handleFiltrar = (event: React.FormEvent) => {
    event.preventDefault();
    setFiltroAplicado({
      siglaTribunal: filtroTribunal.trim().toUpperCase() || undefined,
      numeroProcesso: filtroProcesso.replace(/\D/g, "") || undefined,
      dataInicio: filtroDataInicio || undefined,
      dataFim: filtroDataFim || undefined,
      busca: busca.trim() || undefined,
    });
  };

  const handleLimpar = () => {
    setFiltroTribunal("");
    setFiltroProcesso("");
    setFiltroDataInicio("");
    setFiltroDataFim("");
    setBusca("");
    setFiltroAplicado({});
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportDisabled = flowLoading || !flowEnabled || flowBoards.length === 0;
  const exportDisabledReason = flowLoading
    ? "Carregando boards do Flow"
    : !flowEnabled
      ? "Flow não contratado para este cliente"
      : "Nenhum board Flow acessível";

  const openExportModal = (item: PjeComunicacao) => setExportItem(item);

  const closeExportModal = () => setExportItem(null);

  return (
    <Card>
      <CardHeader className="d-flex align-items-center justify-content-between">
        <h5 className="card-title mb-0">Comunicações</h5>
        <span className="text-muted">{total} registro(s)</span>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleFiltrar} className="row g-2 align-items-end mb-3">
          <div className="col-md-2">
            <label className="form-label" htmlFor="pje-filtro-tribunal">Tribunal</label>
            <Input
              id="pje-filtro-tribunal"
              value={filtroTribunal}
              onChange={(e) => setFiltroTribunal(e.target.value)}
              placeholder="TJMS"
            />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="pje-filtro-processo">Processo</label>
            <Input
              id="pje-filtro-processo"
              value={filtroProcesso}
              onChange={(e) => setFiltroProcesso(e.target.value)}
              placeholder="Somente números"
            />
          </div>
          <div className="col-md-2">
            <label className="form-label" htmlFor="pje-filtro-inicio">De</label>
            <Input
              id="pje-filtro-inicio"
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label" htmlFor="pje-filtro-fim">Até</label>
            <Input
              id="pje-filtro-fim"
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="pje-filtro-busca">Texto</label>
            <Input
              id="pje-filtro-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Conteúdo da comunicação"
            />
          </div>
          <div className="col-12 d-flex gap-2">
            <Button type="submit" color="primary" size="sm">Filtrar</Button>
            <Button type="button" color="light" size="sm" onClick={handleLimpar}>Limpar</Button>
          </div>
        </form>

        {error && <Alert color="danger">{error}</Alert>}

        {loading ? (
          <div className="text-center py-4">
            <Spinner size="sm" color="primary" />
          </div>
        ) : items.length === 0 ? (
          <Alert color="light" className="mb-0">
            Nenhuma comunicação capturada. Configure o monitoramento e execute uma sincronização.
          </Alert>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th scope="col">Disponibilização</th>
                  <th scope="col">Tribunal</th>
                  <th scope="col">Processo</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Órgão</th>
                  <th scope="col" className="text-end">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatData(item.dataDisponibilizacao)}</td>
                    <td>
                      <Badge className="bg-primary-subtle text-primary">{item.siglaTribunal ?? "—"}</Badge>
                    </td>
                    <td className="text-nowrap">{formatProcesso(item)}</td>
                    <td>{item.tipoComunicacao ?? "—"}</td>
                    <td className="text-truncate" style={{ maxWidth: 260 }}>
                      {item.nomeOrgao ?? "—"}
                    </td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <Button
                          color="light"
                          size="sm"
                          disabled={exportDisabled}
                          title={exportDisabled ? exportDisabledReason : "Export to Flow"}
                          onClick={() => openExportModal(item)}
                        >
                          Export to Flow
                        </Button>
                        <Button color="light" size="sm" onClick={() => setSelected(item)}>
                          Ver teor
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="d-flex align-items-center justify-content-between mt-3">
            <span className="text-muted">Página {page} de {totalPages}</span>
            <div className="d-flex gap-2">
              <Button
                color="light"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => void load(page - 1, filtroAplicado)}
              >
                Anterior
              </Button>
              <Button
                color="light"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => void load(page + 1, filtroAplicado)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardBody>

      <Modal isOpen={selected !== null} toggle={() => setSelected(null)} size="lg" scrollable>
        <ModalHeader toggle={() => setSelected(null)}>
          {selected ? `${selected.tipoComunicacao ?? "Comunicação"} — ${formatProcesso(selected)}` : ""}
        </ModalHeader>
        <ModalBody>
          {selected && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <div className="text-muted small">Disponibilização</div>
                  <div>{formatData(selected.dataDisponibilizacao)}</div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted small">Tribunal</div>
                  <div>{selected.siglaTribunal ?? "—"}</div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted small">Meio</div>
                  <div>{selected.meio === "E" ? "Edital" : "Diário Eletrônico"}</div>
                </div>
                <div className="col-md-8">
                  <div className="text-muted small">Órgão</div>
                  <div>{selected.nomeOrgao ?? "—"}</div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted small">Classe</div>
                  <div>{selected.nomeClasse ?? "—"}</div>
                </div>
              </div>

              {(selected.destinatarios ?? []).length > 0 && (
                <div className="mb-3">
                  <div className="text-muted small mb-1">Destinatários</div>
                  {(selected.destinatarios ?? []).map((destinatario, index) => (
                    <Badge key={index} className="bg-secondary-subtle text-secondary me-1">
                      {destinatario.nome ?? "—"}
                    </Badge>
                  ))}
                </div>
              )}

              {(selected.advogados ?? []).length > 0 && (
                <div className="mb-3">
                  <div className="text-muted small mb-1">Advogados</div>
                  {(selected.advogados ?? []).map((advogado, index) => (
                    <Badge key={index} className="bg-info-subtle text-info me-1">
                      {advogado.nome} {advogado.numero_oab ? `(${advogado.numero_oab}/${advogado.uf_oab})` : ""}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="text-muted small mb-1">Teor</div>
              <div className="border rounded p-3 bg-light-subtle" style={{ whiteSpace: "pre-wrap" }}>
                {textoParaExibicao(selected.texto)}
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          {selected?.link && (
            <a
              className="btn btn-primary"
              href={selected.link}
              target="_blank"
              rel="noreferrer"
            >
              Abrir inteiro teor
            </a>
          )}
          <Button color="light" onClick={() => setSelected(null)}>Fechar</Button>
        </ModalFooter>
      </Modal>

      <ExportToFlowModal
        isOpen={exportItem !== null}
        onClose={closeExportModal}
        subject={exportItem ? { label: "Processo", value: formatProcesso(exportItem) } : null}
        boards={flowBoards}
        offices={flowOffices}
        onExport={(boardId, officeId) => juridicoApi.domainIntegrations.exportPjeComunicacaoToFlow(exportItem!.id, boardId, officeId)}
      />
    </Card>
  );
}
