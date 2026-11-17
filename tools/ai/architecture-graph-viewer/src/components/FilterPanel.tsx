import type { GraphFilters, GraphNode } from "../domain/graph";

type Props = {
  nodes: GraphNode[];
  filters: GraphFilters;
  onChange: (filters: GraphFilters) => void;
  onSelectNode: (nodeId: string) => void;
};

function ToggleGroup({ title, values, selected, onToggle }: { title: string; values: string[]; selected: Set<string>; onToggle: (value: string) => void }) {
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      <div className="chips">
        {values.map((value) => (
          <button key={value} type="button" className={selected.has(value) ? "chip active" : "chip"} onClick={() => onToggle(value)}>
            {value}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function toggled(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export function FilterPanel({ nodes, filters, onChange, onSelectNode }: Props) {
  const types = [...new Set(nodes.map((node) => node.type))].sort();
  const lifecycles = [...new Set(nodes.map((node) => node.lifecycle))].sort();
  const owners = [...new Set(nodes.map((node) => node.owner))].sort();
  const matches = filters.query.trim()
    ? nodes.filter((node) => `${node.id} ${node.label}`.toLowerCase().includes(filters.query.toLowerCase())).slice(0, 12)
    : [];
  return (
    <aside className="filters" aria-label="Busca e filtros">
      <label className="search-label" htmlFor="graph-search">Buscar no grafo</label>
      <input
        id="graph-search"
        type="search"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        placeholder="projeto, modulo, endpoint..."
        autoComplete="off"
      />
      {matches.length > 0 && (
        <div className="search-results">
          {matches.map((node) => <button key={node.id} type="button" onClick={() => onSelectNode(node.id)}><span>{node.label}</span><small>{node.type}</small></button>)}
        </div>
      )}
      <ToggleGroup title="Tipos" values={types} selected={filters.types} onToggle={(value) => onChange({ ...filters, types: toggled(filters.types, value) })} />
      <ToggleGroup title="Lifecycle" values={lifecycles} selected={filters.lifecycles} onToggle={(value) => onChange({ ...filters, lifecycles: toggled(filters.lifecycles, value) })} />
      <label className="owner-filter" htmlFor="owner-filter">
        <span>Owner</span>
        <select
          id="owner-filter"
          value={filters.owners.size === 1 ? [...filters.owners][0] : ""}
          onChange={(event) => onChange({ ...filters, owners: event.target.value ? new Set([event.target.value]) : new Set() })}
        >
          <option value="">Todos os owners</option>
          {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
      </label>
      <button className="secondary-action" type="button" onClick={() => onChange({ ...filters, query: "", types: new Set(), lifecycles: new Set(), owners: new Set(), focusNodeId: null })}>Limpar filtros</button>
    </aside>
  );
}
