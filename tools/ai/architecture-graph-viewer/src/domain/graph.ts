export type GraphNode = {
  id: string;
  type: string;
  label: string;
  lifecycle: string;
  owner: string;
  source: string;
  provenance: string;
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  type: string;
  source: string;
  target: string;
  owner: string;
  provenance: string;
  evidence: string;
  metadata: Record<string, unknown>;
};

export type GraphFinding = {
  severity: "error" | "warning" | "info";
  kind: string;
  message: string;
  source: string | null;
  node_id: string | null;
  edge_id: string | null;
};

export type ArchitectureGraph = {
  schema_version: string;
  generated_at: string;
  generator: string;
  summary: {
    nodes: number;
    edges: number;
    findings: number;
    nodes_by_type: Record<string, number>;
    edges_by_type: Record<string, number>;
    findings_by_severity: Record<string, number>;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  findings: GraphFinding[];
};

export type GraphFilters = {
  query: string;
  types: Set<string>;
  lifecycles: Set<string>;
  owners: Set<string>;
  focusNodeId: string | null;
  focusDepth: number;
};

export const EMPTY_FILTERS: GraphFilters = {
  query: "",
  types: new Set(),
  lifecycles: new Set(),
  owners: new Set(),
  focusNodeId: null,
  focusDepth: 1,
};

function neighborhood(graph: ArchitectureGraph, origin: string, depth: number): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const seen = new Set([origin]);
  let frontier = new Set([origin]);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!seen.has(neighbor)) next.add(neighbor);
        seen.add(neighbor);
      }
    }
    frontier = next;
  }
  return seen;
}

export function filterGraph(graph: ArchitectureGraph, filters: GraphFilters): ArchitectureGraph {
  const query = filters.query.trim().toLocaleLowerCase("pt-BR");
  const focused = filters.focusNodeId ? neighborhood(graph, filters.focusNodeId, filters.focusDepth) : null;
  const nodes = graph.nodes.filter((node) => {
    if (filters.types.size && !filters.types.has(node.type)) return false;
    if (filters.lifecycles.size && !filters.lifecycles.has(node.lifecycle)) return false;
    if (filters.owners.size && !filters.owners.has(node.owner)) return false;
    if (focused && !focused.has(node.id)) return false;
    return !query || `${node.id} ${node.label} ${node.source} ${node.owner}`.toLocaleLowerCase("pt-BR").includes(query);
  });
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  return {
    ...graph,
    summary: { ...graph.summary, nodes: nodes.length, edges: edges.length },
    nodes,
    edges,
  };
}

export function connectedEdges(graph: ArchitectureGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}
