/**
 * Retorno da rotina da Analise de Acoes (docs/product/flow-action-analysis-sprints.md, A1).
 * Cada acao e uma linha "Acao" de um bloco do prompt do cliente; as colunas das tabelas
 * do cliente saem destes campos.
 */
export const ACTION_BLOCKS = ['caixa', 'e', 'a', 'b', 'c', 'd'] as const;
export type ActionBlock = (typeof ACTION_BLOCKS)[number];

export const ACTION_BLOCK_LABELS: Record<ActionBlock, string> = {
  caixa: 'Bloco Caixa',
  e: 'Bloco E',
  a: 'Bloco A',
  b: 'Bloco B',
  c: 'Bloco C',
  d: 'Bloco D'
};

export interface ActionContractInput {
  number: string;
  status?: string;
  inclusionDate?: string;
  /** Bloco D: tipo do cartao. */
  cardType?: 'RMC' | 'RCC';
  /** Bloco D: limite do cartao. */
  limit?: string;
}

export interface ActionInput {
  block: ActionBlock;
  bank: string;
  year?: string;
  /** Bloco E: contrato-raiz de referencia. */
  rootContract?: string;
  observations?: string;
  contracts: ActionContractInput[];
}

export interface ActionAnalysisInput {
  status: 'concluida' | 'nao_concluida';
  failureReason?: string;
  header?: { holderName: string; benefitNumber: string; statementDate: string };
  actions: ActionInput[];
}

const YEAR_BLOCKS: ReadonlySet<ActionBlock> = new Set(['caixa', 'a', 'b', 'c']);
const SINGLE_CONTRACT_BLOCKS: ReadonlySet<ActionBlock> = new Set(['a', 'd']);
// Valores que a regra 9 do cliente manda usar quando o numero nao e legivel.
const UNREADABLE = new Set(['nao identificado', 'ilegivel', 'ilegivel parcialmente']);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Regras que o Flow confere antes de gravar. Mensagens em portugues, apontando a acao,
 * para a rotina corrigir e enviar de novo. Lista vazia = valido.
 */
export function validateActionAnalysis(input: ActionAnalysisInput): string[] {
  if (input.status === 'nao_concluida') {
    const errors: string[] = [];
    if (!input.failureReason?.trim()) errors.push('failureReason e obrigatorio quando status = nao_concluida.');
    if (input.actions.length > 0) errors.push('Com status = nao_concluida, envie actions vazio.');
    return errors;
  }
  const errors: string[] = [];
  if (input.failureReason !== undefined) errors.push('failureReason so vale com status = nao_concluida.');
  if (!input.header) errors.push('header (titular, beneficio e data do extrato) e obrigatorio com status = concluida.');

  const blockOfContract = new Map<string, ActionBlock>();
  const counters = new Map<ActionBlock, number>();
  for (const action of input.actions) {
    const position = (counters.get(action.block) ?? 0) + 1;
    counters.set(action.block, position);
    const where = `${ACTION_BLOCK_LABELS[action.block]}, acao ${position}`;
    if (YEAR_BLOCKS.has(action.block) && !action.year?.trim()) errors.push(`${where}: informe o ano.`);
    if (action.block === 'e' && !action.rootContract?.trim()) {
      errors.push(`${where}: informe o contrato-raiz (ou "nao identificado").`);
    }
    if (action.block !== 'e' && action.rootContract !== undefined) errors.push(`${where}: rootContract so vale no Bloco E.`);
    if (SINGLE_CONTRACT_BLOCKS.has(action.block) && action.contracts.length !== 1) {
      errors.push(`${where}: este bloco tem um contrato por acao.`);
    }
    for (const contract of action.contracts) {
      if (action.block === 'd' && !contract.cardType) errors.push(`${where}: informe o tipo do cartao (RMC ou RCC).`);
      if (action.block !== 'd' && (contract.cardType !== undefined || contract.limit !== undefined)) {
        errors.push(`${where}: cardType e limit so valem no Bloco D.`);
      }
      const key = normalize(contract.number);
      if (UNREADABLE.has(key)) continue;
      const previous = blockOfContract.get(key);
      // Regra 8 do cliente: um contrato nunca aparece em mais de um bloco.
      if (previous && previous !== action.block) {
        errors.push(`Contrato ${contract.number.trim()} aparece no ${ACTION_BLOCK_LABELS[previous]} e no ${ACTION_BLOCK_LABELS[action.block]}.`);
      }
      blockOfContract.set(key, previous ?? action.block);
    }
  }
  return [...new Set(errors)];
}
