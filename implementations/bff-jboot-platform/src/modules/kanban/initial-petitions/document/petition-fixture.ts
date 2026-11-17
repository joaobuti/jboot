import { PetitionContent } from './petition-content';

/**
 * Peticao de exemplo para os testes do motor (texto do proprio escritorio, secao 6 do prompt, com
 * dados ficticios). Nao e resposta de API externa: e o formato que a rotina envia ao Flow.
 */
export function samplePetition(overrides: Partial<PetitionContent> = {}): PetitionContent {
  return {
    court: 'jec',
    fileBank: 'Santander',
    clientFirstName: 'Sérgio',
    addressing: 'AO JUIZADO ESPECIAL CÍVEL DA COMARCA DE FLORIANÓPOLIS, ESTADO DE SANTA CATARINA.',
    elderlyPriority: true,
    body: [
      {
        type: 'paragraph',
        noIndent: true,
        runs: [{ text: 'SÉRGIO DA SILVA', bold: true }, { text: ', brasileiro, viúvo, aposentado, portador da Carteira de Identidade nº XXXX SSP/SC.' }]
      },
      { type: 'title', text: 'AÇÃO DECLARATÓRIA DE INEXISTÊNCIA DE RELAÇÃO JURÍDICA C/C REPETIÇÃO DE INDÉBITO E INDENIZAÇÃO POR DANOS MORAIS' },
      { type: 'heading', text: 'I. GRATUIDADE DA JUSTIÇA.' },
      {
        type: 'paragraph',
        runs: [
          { text: 'O Autor requer os benefícios da gratuidade da justiça, nos termos dos arts. 98 e seguintes do Código de Processo Civil' },
          { text: '.', footnote: { url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm', accessedAt: '2026-09-30' } }
        ]
      },
      { type: 'heading', text: 'III.1 RELAÇÃO DE CONSUMO.' },
      {
        type: 'quote',
        runs: [
          {
            text: 'RECURSO INOMINADO — CONSIGNADO. Descontos indevidos (...) dano moral configurado. (TJSC, Recurso Inominado n. 5000000-00.2025.8.24.0023, rel. Fulano, j. 01-02-2026).',
            footnote: { url: 'https://www.jusbrasil.com.br/jurisprudencia/tj-sc/123', accessedAt: '2026-10-01' }
          }
        ]
      },
      { type: 'table', header: ['Limite', 'Total descontado'], rows: [['R$ 1.000,00', 'R$ 3.200,00']] },
      { type: 'figure', figureId: 'print-1', caption: 'Figura 1. Extrato HISCON/INSS: competências de 03/2024 e 04/2024.' }
    ],
    calculation: {
      intro: [{ text: 'Autor: SÉRGIO DA SILVA. Réu: BANCO SANTANDER S.A. Data-base: 09/2026.' }],
      contracts: [
        { topic: 'II.1', contract: '123456', installment: 'R$ 100,00', firstDiscount: '10/2021', lastDiscount: '09/2026', quantity: '60', simpleValue: 'R$ 6.000,00' }
      ],
      total: 'R$ 6.000,00',
      ceiling: [
        { label: 'Dano material simples', value: 'R$ 6.000,00' },
        { label: 'Resultado', value: 'dobro' }
      ],
      causeValue: 'R$ 22.000,00'
    },
    ...overrides
  };
}
