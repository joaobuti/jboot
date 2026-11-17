import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filterGraph, type ArchitectureGraph } from "./graph";

const fixture: ArchitectureGraph = {
  schema_version: "1.0.0",
  generated_at: "deterministic",
  generator: "test",
  summary: { nodes: 3, edges: 2, findings: 0, nodes_by_type: {}, edges_by_type: {}, findings_by_severity: {} },
  nodes: [
    { id: "project:a", type: "project", label: "A", lifecycle: "active", owner: "one", source: "a", provenance: "registry", metadata: {} },
    { id: "module:a/x", type: "module", label: "X", lifecycle: "active", owner: "one", source: "x", provenance: "registry", metadata: {} },
    { id: "service:b", type: "service", label: "B", lifecycle: "derived", owner: "two", source: "b", provenance: "registry", metadata: {} },
  ],
  edges: [
    { id: "e1", type: "contains", source: "project:a", target: "module:a/x", owner: "one", provenance: "registry", evidence: "a", metadata: {} },
    { id: "e2", type: "calls", source: "module:a/x", target: "service:b", owner: "one", provenance: "registry", evidence: "a", metadata: {} },
  ],
  findings: [],
};

describe("filterGraph", () => {
  it("filters by type and removes dangling visible edges", () => {
    const result = filterGraph(fixture, { ...EMPTY_FILTERS, types: new Set(["module"]) });
    expect(result.nodes.map((node) => node.id)).toEqual(["module:a/x"]);
    expect(result.edges).toEqual([]);
  });

  it("limits the graph to the configured neighborhood", () => {
    const result = filterGraph(fixture, { ...EMPTY_FILTERS, focusNodeId: "project:a", focusDepth: 1 });
    expect(result.nodes.map((node) => node.id)).toEqual(["project:a", "module:a/x"]);
    expect(result.edges.map((edge) => edge.id)).toEqual(["e1"]);
  });

  it("filters by owner and searches provenance fields", () => {
    const byOwner = filterGraph(fixture, { ...EMPTY_FILTERS, owners: new Set(["two"]) });
    expect(byOwner.nodes.map((node) => node.id)).toEqual(["service:b"]);

    const bySource = filterGraph(fixture, { ...EMPTY_FILTERS, query: "x" });
    expect(bySource.nodes.map((node) => node.id)).toEqual(["module:a/x"]);
  });
});
