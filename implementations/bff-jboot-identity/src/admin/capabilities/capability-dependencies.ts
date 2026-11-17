/**
 * Dependencia entre capabilities (`capability_registry.requires_capability`): ex. DJEN exige o DataJud
 * (ADR 022). Valida o estado final do cliente (atual sobreposto pelo pedido), nao so o pedido, para o
 * operador nao conseguir desligar a capability base deixando a dependente ligada.
 */
export interface CapabilityDependency {
  slug: string;
  label: string;
  requiresCapability: string | null;
}

export function capabilityDependencyViolations(
  catalog: CapabilityDependency[],
  current: Array<{ slug: string; enabled: boolean }>,
  requested: Array<{ slug: string; enabled: boolean }>
): string[] {
  const state = new Map(current.map((entry) => [entry.slug, entry.enabled]));
  for (const entry of requested) state.set(entry.slug, entry.enabled);
  const labels = new Map(catalog.map((entry) => [entry.slug, entry.label]));
  return catalog
    .filter((entry) => entry.requiresCapability && state.get(entry.slug) === true && state.get(entry.requiresCapability) !== true)
    .map((entry) => `${entry.label} exige ${labels.get(entry.requiresCapability as string) ?? entry.requiresCapability}`);
}
