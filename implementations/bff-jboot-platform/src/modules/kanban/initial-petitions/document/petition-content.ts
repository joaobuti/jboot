import { z } from 'zod/v4';

/**
 * Conteudo estruturado de uma peticao inicial no modo Flow (ADR 020, decisao do usuario 1; S4 de
 * docs/product/flow-initial-petitions-sprints.md). A rotina redige; o Flow monta o .docx com a secao 11
 * do prompt do escritorio. Limites protegem o BFF (envio por chamada de ferramenta) e a peca.
 */
const text = (max: number) => z.string().min(1).max(max);

export const footnoteSchema = z.object({
  url: text(2000).describe('Endereco que abre a lei, sumula, tema ou o acordao citado'),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Data de acesso, AAAA-MM-DD')
});

export const runSchema = z.object({
  text: text(4000).describe('Trecho do paragrafo. Dado ausente: XXXX (o Flow realca em amarelo)'),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  footnote: footnoteSchema.optional().describe('Nota de rodape real, numerada pelo Flow, depois deste trecho')
});

const runsSchema = z.array(runSchema).min(1).max(200);

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), text: text(500).describe('Titulo da acao, em negrito') }),
  z.object({ type: z.literal('heading'), text: text(300).describe('Topico ou subtopico ("II. FATOS.", "II.1 ...")') }),
  z.object({
    type: z.literal('paragraph'),
    runs: runsSchema,
    align: z.enum(['justify', 'left', 'center', 'right']).optional().describe('Padrao: justificado com recuo de 3 cm'),
    noIndent: z.boolean().optional().describe('Sem recuo de primeira linha (qualificacao). O fecho e a assinatura sao do Flow')
  }),
  z.object({
    type: z.literal('quote'),
    runs: runsSchema.describe('Ementa literal; termina com a nota de rodape do link do acordao')
  }),
  z.object({
    type: z.literal('table'),
    header: z.array(text(200)).min(1).max(10),
    rows: z.array(z.array(z.string().max(500))).max(60),
    totalRow: z.array(z.string().max(500)).optional()
  }),
  z.object({
    type: z.literal('figure'),
    figureId: text(60).describe('Id do print do HISCON recortado pelo Flow'),
    caption: text(1000).describe('Legenda ("Figura 1. Extrato HISCON/INSS: ...")')
  })
]);

export const calculationSchema = z.object({
  intro: runsSchema.describe('Autor, reu, beneficio, data-base, periodo e valores historicos sem correcao'),
  contracts: z
    .array(
      z.object({
        topic: text(120),
        contract: text(120),
        installment: text(40),
        firstDiscount: text(20),
        lastDiscount: text(20),
        quantity: text(10),
        simpleValue: text(40)
      })
    )
    .min(1)
    .max(100),
  total: text(40).describe('TOTAL da coluna Valor simples'),
  ceiling: z.array(z.object({ label: text(200), value: text(200) })).min(1).max(10).describe('Tabela 2, linhas antes de VALOR DA CAUSA'),
  causeValue: text(40)
});

export const petitionContentSchema = z.object({
  court: z.enum(['jec', 'jef']),
  fileBank: text(60).describe('Banco no nome do arquivo (ex.: Santander, BMG_RMC)'),
  clientFirstName: text(60),
  addressing: text(500).describe('Enderecamento, em negrito'),
  elderlyPriority: z.boolean().describe('60 anos ou mais: linha de prioridade de tramitacao'),
  body: z.array(blockSchema).min(1).max(800),
  calculation: calculationSchema
});

export type PetitionRun = z.infer<typeof runSchema>;
export type PetitionBlock = z.infer<typeof blockSchema>;
export type PetitionCalculation = z.infer<typeof calculationSchema>;
export type PetitionContent = z.infer<typeof petitionContentSchema>;

export const PRIORITY_LINE = 'PRIORIDADE DE TRAMITAÇÃO: PESSOA IDOSA (ART. 1.048, I, DO CPC)';
export const CALCULATION_TITLE = 'MEMÓRIA DE CÁLCULO DO VALOR DA CAUSA';
export const CALCULATION_CONTRACT_HEADER = [
  'Tópico',
  'Contrato',
  'Parcela',
  '1º desconto considerado',
  'Último desconto considerado',
  'Qtd.',
  'Valor simples'
];
export const CEILING_TITLE = 'Verificação do teto (40 salários mínimos)';
