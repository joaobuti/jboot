import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailsPanel } from "./components/DetailsPanel";
import { FilterPanel } from "./components/FilterPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { EMPTY_FILTERS, filterGraph, type ArchitectureGraph, type GraphFilters } from "./domain/graph";
import { loadGraph } from "./lib/load-graph";

export default function App() {
  const [graph, setGraph] = useState<ArchitectureGraph | null>(null);
  const [filters, setFilters] = useState<GraphFilters>(EMPTY_FILTERS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadGraph(controller.signal).then(setGraph).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha desconhecida");
    });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => graph ? filterGraph(graph, filters) : null, [graph, filters]);
  const selected = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const visibleSelectedNodeId = visible?.nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;
  const selectNode = useCallback((nodeId: string | null) => setSelectedNodeId(nodeId), []);
  const focus = useCallback((nodeId: string, depth: number) => {
    setFilters((current) => ({ ...current, query: "", focusNodeId: nodeId, focusDepth: depth }));
    setSelectedNodeId(nodeId);
  }, []);

  if (error) return <main className="status-page"><span>Architecture Graph</span><h1>Nao foi possivel carregar o grafo</h1><p>{error}</p><code>make ai-architecture-graph-viewer</code></main>;
  if (!graph || !visible) return <main className="status-page"><span>Architecture Graph</span><h1>Preparando visualizacao...</h1><p>Validando nodes, edges e provenance.</p></main>;

  return (
    <main className="app-shell">
      <header>
        <div className="brand"><span className="brand-mark">JB</span><div><strong>Architecture Graph</strong><small>JBoot Engineering</small></div></div>
        <div className="metrics" aria-label="Metricas do grafo">
          <span><strong>{visible.nodes.length}</strong> nodes</span>
          <span><strong>{visible.edges.length}</strong> edges</span>
          <span className={graph.summary.findings_by_severity.error ? "metric-error" : ""}><strong>{graph.summary.findings_by_severity.error ?? 0}</strong> errors</span>
        </div>
        <div className="read-only">READ ONLY</div>
      </header>
      <section className="workspace">
        <FilterPanel nodes={graph.nodes} filters={filters} onChange={setFilters} onSelectNode={selectNode} />
        <section className="canvas-panel">
          {visible.nodes.length > 0 ? (
            <>
              <GraphCanvas graph={visible} selectedNodeId={visibleSelectedNodeId} onSelectNode={selectNode} />
              <div className="canvas-help">Scroll: zoom · arraste: navegar · clique: inspecionar</div>
            </>
          ) : (
            <div className="empty-graph" role="status">
              <span>0 nodes</span>
              <h2>Nenhum resultado no recorte atual</h2>
              <p>Revise a busca ou remova os filtros para voltar ao grafo completo.</p>
              <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button>
            </div>
          )}
          {filters.focusNodeId && <button className="clear-focus" type="button" onClick={() => setFilters((current) => ({ ...current, focusNodeId: null }))}>Mostrar grafo completo</button>}
        </section>
        <DetailsPanel graph={graph} node={selected} onFocus={focus} onNavigate={selectNode} onClose={() => selectNode(null)} />
      </section>
    </main>
  );
}
