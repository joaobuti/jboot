import type { ArchitectureGraph } from "../domain/graph";

const NODE_ID = /^[a-z][a-z0-9_-]*:.+$/;

export async function loadGraph(signal?: AbortSignal): Promise<ArchitectureGraph> {
  const response = await fetch("/graph.json", { signal, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`Falha ao carregar graph.json (${response.status})`);
  const document: unknown = await response.json();
  if (!isGraph(document)) throw new Error("graph.json nao atende ao contrato esperado");
  return document;
}

function isGraph(value: unknown): value is ArchitectureGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<ArchitectureGraph>;
  return graph.schema_version === "1.0.0"
    && Array.isArray(graph.nodes)
    && Array.isArray(graph.edges)
    && graph.nodes.every((node) => NODE_ID.test(node?.id ?? "") && typeof node?.label === "string")
    && graph.edges.every((edge) => typeof edge?.id === "string" && typeof edge?.source === "string" && typeof edge?.target === "string");
}
