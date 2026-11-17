import { CreateCardFromSourceInput } from '../../kanban/cards/cards.repository';
import { ManualSnapshotRow } from '../../juridico/datajud/datajud.repository';
import { PjeComunicacaoRow } from '../../juridico/pje/pje.repository';

const FOOTER_BUDGET = 60;

type FlowCardSourceInput = Omit<CreateCardFromSourceInput, 'boardColumnId'>;

export function mapPjeCommunicationToFlowCard(comunicacao: PjeComunicacaoRow): FlowCardSourceInput {
  const processo = comunicacao.numeroProcessoMask ?? comunicacao.numeroProcesso ?? 'sem processo';
  const title = truncate(`PJe ${processo} - ${comunicacao.tipoComunicacao ?? 'Comunicacao'}`, 200);
  const description = [
    `Processo: ${processo}`,
    `Tribunal: ${comunicacao.siglaTribunal ?? '-'}`,
    `Orgao: ${comunicacao.nomeOrgao ?? '-'}`,
    `Classe: ${comunicacao.nomeClasse ?? '-'}`,
    `Tipo: ${comunicacao.tipoComunicacao ?? '-'}`,
    `Disponibilizacao: ${comunicacao.dataDisponibilizacao ?? '-'}`,
    '',
    comunicacao.texto ? truncate(comunicacao.texto.replace(/\s+/g, ' ').trim(), 4000) : 'Sem teor disponivel.'
  ].join('\n');

  return {
    title,
    description,
    sourceModule: 'juridico',
    sourceType: 'pje_comunicacao',
    sourceId: comunicacao.id,
    sourceUrl: `/juridico/pje?comunicacao=${comunicacao.id}`,
    sourcePayload: {
      numeroProcesso: comunicacao.numeroProcesso,
      numeroProcessoMask: comunicacao.numeroProcessoMask,
      siglaTribunal: comunicacao.siglaTribunal,
      nomeOrgao: comunicacao.nomeOrgao,
      tipoComunicacao: comunicacao.tipoComunicacao,
      tipoDocumento: comunicacao.tipoDocumento,
      nomeClasse: comunicacao.nomeClasse,
      dataDisponibilizacao: comunicacao.dataDisponibilizacao
    }
  };
}

export function mapDataJudSnapshotToFlowCard(
  snapshot: ManualSnapshotRow,
  processNumber: string,
  movements: Array<{ occurredAt: string | null; description: string }>
): FlowCardSourceInput {
  const digits = processNumber.replace(/\D/g, '');
  const mask = maskCnj(digits);
  const title = truncate(`DataJud ${mask} - ${name(snapshot.classe) ?? 'Processo'}`, 200);
  const header = [
    `Processo: ${mask}`,
    `Tribunal: ${snapshot.tribunal}`,
    `Grau: ${snapshot.grau ?? '-'}`,
    `Classe: ${name(snapshot.classe) ?? '-'}`,
    `Orgao julgador: ${name(snapshot.orgaoJulgador) ?? '-'}`,
    `Assuntos: ${names(snapshot.assuntos) || '-'}`,
    `Formato: ${name(snapshot.formato) ?? '-'}`,
    `Sistema: ${name(snapshot.sistema) ?? '-'}`,
    `Ajuizamento: ${dateTime(snapshot.dataAjuizamento)}`,
    `Ultima atualizacao: ${dateTime(snapshot.providerUpdatedAt)}`,
    '',
    'Movimentacoes:'
  ].join('\n');
  const lines: string[] = [];
  let used = header.length + 1;
  for (const movement of movements) {
    const line = `- ${dateTime(movement.occurredAt)}: ${movement.description}`;
    if (used + line.length + 1 + FOOTER_BUDGET > 4000) break;
    used += line.length + 1;
    lines.push(line);
  }
  const omitted = movements.length - lines.length;
  const description = [
    header,
    lines.join('\n') || '- Sem movimentacao registrada.',
    omitted > 0 ? `(+${omitted} movimentacoes nao exibidas)` : ''
  ].filter(Boolean).join('\n');

  return {
    title,
    description,
    sourceModule: 'juridico',
    sourceType: 'datajud_processo',
    sourceId: `${digits}:${snapshot.tribunal}`,
    sourceUrl: `/juridico/consultas/processo?numero=${digits}&tribunal=${snapshot.tribunal}`,
    sourcePayload: {
      numeroProcesso: digits,
      numeroProcessoMask: mask,
      tribunal: snapshot.tribunal,
      datajudId: snapshot.datajudId,
      grau: snapshot.grau,
      classe: snapshot.classe,
      orgaoJulgador: snapshot.orgaoJulgador,
      formato: snapshot.formato,
      sistema: snapshot.sistema,
      assuntos: snapshot.assuntos,
      dataAjuizamento: snapshot.dataAjuizamento,
      dataUltimaAtualizacao: snapshot.providerUpdatedAt,
      sincronizadoEm: snapshot.sincronizadoEm,
      totalMovimentacoes: movements.length,
      fonte: 'datajud'
    }
  };
}

function dateTime(value: string | Date | null): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  const iso = date.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

function maskCnj(digits: string): string {
  if (digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function name(value: unknown): string | null {
  return typeof value === 'object' && value !== null && 'nome' in value
    ? String((value as { nome: unknown }).nome)
    : null;
}

function names(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => name(item)).filter(Boolean).join(', ') : '';
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
