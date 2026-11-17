import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction } from "sigma/rendering";
import type { ArchitectureGraph } from "../domain/graph";

const COLORS: Record<string, string> = {
  project: "#20c7d9",
  module: "#6ce5b1",
  service: "#ffbb66",
  api_endpoint: "#8498ff",
  decision: "#e879f9",
  sprint: "#f97393",
  agent: "#c6d2e3",
  skill: "#a78bfa",
  capability: "#38bdf8",
  evidence: "#94a3b8",
  tool: "#fb7185",
};

const LABEL_COLOR = "#e6f4ff";

const drawDarkNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  if (typeof data.label !== "string" || !data.label) return;
  context.save();
  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
  const width = context.measureText(data.label).width;
  const x = data.x + data.size + 3;
  const y = data.y - settings.labelSize / 2 - 4;
  context.fillStyle = "rgba(5, 14, 21, 0.96)";
  context.strokeStyle = "rgba(83, 129, 151, 0.75)";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x - 5, y, width + 10, settings.labelSize + 8, 5);
  context.fill();
  context.stroke();
  context.fillStyle = LABEL_COLOR;
  context.fillText(data.label, x, data.y + settings.labelSize / 3);
  context.restore();
};

type Props = {
  graph: ArchitectureGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
};

function position(index: number, total: number): { x: number; y: number } {
  const angle = index * 2.399963229728653;
  const radius = Math.sqrt((index + 1) / Math.max(total, 1)) * 100;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function GraphCanvas({ graph: document, selectedNodeId, onSelectNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const selectedRef = useRef<string | null>(selectedNodeId);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    rendererRef.current?.refresh();
  }, [selectedNodeId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const graph = new Graph({ multi: true, type: "directed" });
    document.nodes.forEach((node, index) => {
      graph.addNode(node.id, {
        ...position(index, document.nodes.length),
        label: node.label,
        size: node.type === "project" ? 12 : node.type === "module" ? 8 : node.type === "api_endpoint" ? 2.5 : 5,
        color: COLORS[node.type] ?? "#8fa3b8",
        nodeType: node.type,
      });
    });
    document.edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
          color: edge.type === "calls" ? "#38516d" : "#29384a",
          size: edge.type === "calls" ? 0.8 : 0.5,
          edgeType: edge.type,
        });
      }
    });
    if (graph.order > 1 && graph.order <= 2500) {
      forceAtlas2.assign(graph, { iterations: graph.order > 1000 ? 35 : 70, settings: forceAtlas2.inferSettings(graph) });
    }
    const renderer = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: false,
      defaultEdgeType: "line",
      labelDensity: 0.12,
      labelGridCellSize: 90,
      labelRenderedSizeThreshold: 7,
      labelColor: { color: LABEL_COLOR },
      defaultDrawNodeHover: drawDarkNodeHover,
      renderEdgeLabels: false,
      nodeReducer: (node, data) => {
        const selected = selectedRef.current;
        if (!selected || !graph.hasNode(selected)) return data;
        if (node === selected) return { ...data, highlighted: true, size: Number(data.size) * 1.5, zIndex: 2 };
        const adjacent = graph.hasEdge(node, selected) || graph.hasEdge(selected, node);
        return adjacent ? { ...data, zIndex: 1 } : { ...data, color: "#263442", label: "", zIndex: 0 };
      },
      edgeReducer: (edge, data) => {
        const selected = selectedRef.current;
        if (!selected || !graph.hasNode(selected)) return data;
        const [source, target] = graph.extremities(edge);
        return source === selected || target === selected
          ? { ...data, color: "#63d9e8", size: 1.6, zIndex: 2 }
          : { ...data, color: "#1c2937", hidden: false, zIndex: 0 };
      },
    });
    rendererRef.current = renderer;
    renderer.on("clickNode", ({ node }) => onSelectNode(node));
    renderer.on("clickStage", () => onSelectNode(null));
    return () => {
      rendererRef.current = null;
      renderer.kill();
    };
  }, [document, onSelectNode]);

  return <div ref={containerRef} className="graph-canvas" aria-label="Visualizacao interativa do grafo arquitetural" />;
}
