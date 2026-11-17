import { z } from 'zod/v4';
import { petitionContentSchema } from './document/petition-content';

/**
 * Entradas das ferramentas de peticoes iniciais do modo Flow (ADR 020, decisoes 4 e 11; S5 de
 * docs/product/flow-initial-petitions-sprints.md). Envio em duas ferramentas (Q3): uma peticao por
 * chamada, provisoria; o fechamento leva o relatorio e grava tudo de uma vez.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const key = z.string().regex(/^[a-z0-9_-]{1,60}$/);

export const submitPetitionSchema = {
  runId: z.guid(),
  petitionKey: key.describe('Chave da peticao nesta execucao (ex.: "santander-jec"); reenvio com a mesma chave substitui'),
  actionIds: z
    .array(z.guid())
    .max(50)
    .describe('actionId das acoes da Analise de Acoes que esta peticao cobre; vazio quando o card nao tem analise'),
  content: petitionContentSchema
};

export const reportSchema = z.object({
  excludedContracts: z
    .array(z.object({ contract: text(120), bank: text(200).optional(), reason: text(500) }))
    .max(300)
    .describe('Contratos deixados de fora e o motivo (litispendencia, corte de 08/2021, parcela abaixo de R$ 15...)'),
  pendingData: z.array(text(500)).max(200).describe('Dados em XXXX, por peca'),
  courtsToCheck: z.array(text(500)).max(50).describe('Juizo a conferir (cidade que nao e sede de comarca ou subsecao)'),
  precedents: z
    .array(z.object({ processNumber: text(40), url: z.url().max(2000), court: text(200).optional(), theme: text(300).optional() }))
    .max(100)
    .describe('Julgados usados (numero CNJ e link direto)'),
  themesWithoutStateRuling: z.array(text(300)).max(50).describe('Temas que ficaram sem ementa do estado'),
  alerts: z
    .array(
      z.object({
        kind: z.enum(['rmc_temas_1328_1414', 'tema_183_hipotese_i', 'compensacao_portabilidade_refinanciamento', 'irdr_ou_sumula_do_estado', 'outro']),
        text: text(1000)
      })
    )
    .max(50),
  pendingDecisions: z
    .array(text(1000))
    .max(50)
    .describe('Pontos que pedem decisao humana: RMC/RCC sem Bloco D, cadeia entre instituicoes, banco fora do Anexo A')
});

export const finishPetitionsSchema = {
  runId: z.guid(),
  status: z.enum(['concluida', 'nao_concluida']).describe('nao_concluida quando nao foi possivel redigir (ex.: HISCON ilegivel)'),
  failureReason: text(1000).optional().describe('Somente com nao_concluida'),
  report: reportSchema.optional().describe('Obrigatorio com concluida'),
  actionsWithoutPetition: z
    .array(z.object({ actionId: z.guid(), reason: text(500) }))
    .max(200)
    .optional()
    .describe('Acoes da analise que ficaram sem peca, com o motivo')
};

export type PetitionReport = z.infer<typeof reportSchema>;

export interface FinishPetitionsInput {
  status: 'concluida' | 'nao_concluida';
  failureReason?: string;
  report?: PetitionReport;
  actionsWithoutPetition?: Array<{ actionId: string; reason: string }>;
}

/**
 * Fechamento: concluida exige relatorio e ao menos uma peticao; com analise, cada acao fica em uma
 * peticao ou na lista de acoes sem peca (com motivo), nunca nas duas nem fora delas.
 */
export function finishProblems(
  input: FinishPetitionsInput,
  drafts: Array<{ petitionKey: string; actionIds: string[] }>,
  analysisActionIds: string[] | null
): string[] {
  if (input.status === 'nao_concluida') {
    return input.failureReason ? [] : ['failureReason e obrigatorio quando status = nao_concluida.'];
  }
  const problems: string[] = [];
  if (input.failureReason) problems.push('failureReason so vale com status = nao_concluida.');
  if (!input.report) problems.push('report e obrigatorio com status = concluida.');
  if (drafts.length === 0) problems.push('Nenhuma peticao foi enviada nesta execucao (flow_submit_initial_petition).');
  const without = input.actionsWithoutPetition ?? [];
  if (!analysisActionIds) {
    if (without.length > 0) problems.push('O card nao tem Analise de Acoes: actionsWithoutPetition deve ficar vazio.');
    return problems;
  }
  const known = new Set(analysisActionIds);
  const covered = new Map<string, string>();
  for (const draft of drafts) for (const id of draft.actionIds) covered.set(id, draft.petitionKey);
  const explained = new Set<string>();
  for (const item of without) {
    if (!known.has(item.actionId)) problems.push(`Acao ${item.actionId} nao e da analise usada.`);
    else if (covered.has(item.actionId)) problems.push(`Acao ${item.actionId} esta na peticao "${covered.get(item.actionId)}" e em actionsWithoutPetition.`);
    explained.add(item.actionId);
  }
  const missing = analysisActionIds.filter((id) => !covered.has(id) && !explained.has(id));
  if (missing.length > 0) {
    problems.push(`Acoes sem peticao e sem motivo: ${missing.join(', ')}. Ligue cada uma a uma peticao ou informe em actionsWithoutPetition.`);
  }
  return problems;
}
