/** Data guardada como AAAA-MM-DD (API) exibida e digitada como DD/MM/AAAA. */
export function isoToBrDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value ?? "";
}

/** DD/MM/AAAA digitado para AAAA-MM-DD; `null` quando nao e uma data real. */
export function brDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? `${match[3]}-${match[2]}-${match[1]}` : null;
}
