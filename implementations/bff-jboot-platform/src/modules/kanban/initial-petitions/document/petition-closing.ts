import { formatDateExtenso } from '../../document-templates/template-variable-catalog';
import type { PetitionClosingContext } from '../petition-preconditions.service';
import type { PetitionContent } from './petition-content';

/**
 * Fecho da peticao montado pelo Flow (ADR 020, emenda de 2026-10-29, decisoes 15 a 18; S7 de
 * docs/product/flow-initial-petitions-sprints.md): "Nesses termos," / "pede deferimento." /
 * "Cidade/UF, 29 de outubro de 2026." / nome como cadastrado, em negrito / "OAB/UF nº 12345". Dado ausente sai
 * XXXX (realcado pela montagem). A data e a da geracao.
 */
export interface PetitionClosingLine {
  text: string;
  bold?: boolean;
}

const PENDING = 'XXXX';

export function petitionClosingLines(closing: PetitionClosingContext, todayIso: string): PetitionClosingLine[] {
  const place = closing.place ? `${closing.place.city}/${closing.place.uf}` : `${PENDING}/${PENDING}`;
  const date = formatDateExtenso(todayIso) ?? `${PENDING} de ${PENDING} de ${PENDING}`;
  const signer = closing.signer;
  return [
    { text: 'Nesses termos,' },
    { text: 'pede deferimento.' },
    { text: `${place}, ${date}.` },
    { text: signer ? signer.name : PENDING, bold: true },
    { text: signer ? `OAB/${signer.oabUf} nº ${signer.oabNumber}` : `OAB/${PENDING} nº ${PENDING}` }
  ];
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const CLOSING_MARKERS: ReadonlyArray<{ test: (folded: string) => boolean; label: string }> = [
  { test: (folded) => folded.includes('nesses termos'), label: '"Nesses termos"' },
  { test: (folded) => folded.includes('pede deferimento'), label: '"pede deferimento"' },
  { test: (folded) => folded.includes('data do protocolo'), label: '"Local e data do protocolo"' },
  { test: (folded) => /\boab\s*\/\s*([a-z]{2}|x{4})\b/.test(folded), label: 'assinatura com "OAB/UF"' }
];

/** O fecho e do Flow: paragrafo do corpo com um marcador dele e recusado, com a orientacao. */
export function closingProblems(content: PetitionContent): string[] {
  const errors: string[] = [];
  content.body.forEach((block, index) => {
    if (block.type !== 'paragraph') return;
    const folded = fold(block.runs.map((run) => run.text).join(''));
    const found = CLOSING_MARKERS.filter((marker) => marker.test(folded)).map((marker) => marker.label);
    if (found.length > 0) {
      errors.push(
        `Bloco ${index + 1} (paragrafo): ${found.join(', ')}. O fecho (Nesses termos, pede deferimento, local e data, nome e OAB) ` +
          'e montado pelo Flow depois do corpo: termine o corpo no "Da-se a causa..." e remova o fecho.'
      );
    }
  });
  return errors;
}
