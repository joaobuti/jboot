import { OfficeRow } from './offices.repository';

/**
 * Escritorio ativo (docs/product/flow-offices-sprints.md, S2): o escolhido, se ainda for dele e ativo;
 * senao o principal, se for dele; senao o primeiro por nome.
 */
export function pickActiveOffice(own: OfficeRow[], preference: string | null): string | null {
  const active = own.filter((office) => office.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (preference && active.some((office) => office.id === preference)) return preference;
  return active.find((office) => office.isPrincipal)?.id ?? active[0]?.id ?? null;
}
