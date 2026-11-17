import { connectedEdges, type ArchitectureGraph, type GraphNode } from "../domain/graph";

type Props = {
  graph: ArchitectureGraph;
  node: GraphNode | null;
  onFocus: (nodeId: string, depth: number) => void;
  onNavigate: (nodeId: string) => void;
  onClose: () => void;
};

export function DetailsPanel({ graph, node, onFocus, onNavigate, onClose }: Props) {
  if (!node) return <aside className="details empty"><p>Selecione um no para inspecionar origem, ownership e dependencias.</p></aside>;
  const edges = connectedEdges(graph, node.id);
  return (
    <aside className="details" aria-label={`Detalhes de ${node.label}`}>
      <div className="details-heading">
        <div><span className="eyebrow">{node.type}</span><h2>{node.label}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar detalhes">×</button>
      </div>
      <code className="node-id">{node.id}</code>
      <dl>
        <div><dt>Lifecycle</dt><dd>{node.lifecycle}</dd></div>
        <div><dt>Owner</dt><dd>{node.owner}</dd></div>
        <div><dt>Provenance</dt><dd>{node.provenance}</dd></div>
        <div><dt>Source</dt><dd>{node.source}</dd></div>
      </dl>
      <div className="focus-actions">
        <button type="button" onClick={() => onFocus(node.id, 1)}>Vizinhos diretos</button>
        <button type="button" onClick={() => onFocus(node.id, 2)}>Impacto em 2 niveis</button>
      </div>
      <h3>Relacoes <span>{edges.length}</span></h3>
      <div className="relations">
        {edges.map((edge) => {
          const outbound = edge.source === node.id;
          const otherId = outbound ? edge.target : edge.source;
          const other = graph.nodes.find((item) => item.id === otherId);
          return (
            <button type="button" key={edge.id} onClick={() => onNavigate(otherId)}>
              <small>{outbound ? "saida" : "entrada"} · {edge.type}</small>
              <span>{other?.label ?? otherId}</span>
            </button>
          );
        })}
      </div>
      {Object.keys(node.metadata).length > 0 && <details><summary>Metadata tecnica</summary><pre>{JSON.stringify(node.metadata, null, 2)}</pre></details>}
    </aside>
  );
}
