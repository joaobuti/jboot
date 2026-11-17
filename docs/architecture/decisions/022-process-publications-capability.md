# ADR 022: Publicacoes Processuais (DJEN) Como Capacidade Do Acompanhamento

Status: aceita em 2026-11-08 (confirmacao humana na conversa de planejamento).
Relacionadas: ADR 006 (capacidades por cliente), ADR 009 (servico de dados
juridicos), ADR 021 (monitoramento processual como capacidade).

## Contexto

O DataJud traz so metadados das movimentacoes (nome, data, vara, complemento
tabelado). O conteudo dos atos (despachos, decisoes, intimacoes) esta no DJEN.
Teste real em 2026-11-08 (processo 5013400-76.2026.4.04.7003, TRF4): 8
comunicacoes com texto completo em HTML, resposta em 0,65 s; no mesmo dia o
DataJud levava de 20 a 36 s por consulta.

O DJEN e publico e gratuito; o valor vendido e reunir as fontes no card,
avisar a intimacao nova e permitir automacao sobre ela.

## Decisao

- Capacidade nova `publicacoes-processuais`, rotulo "Publicacoes processuais
  (DJEN)", vendida a parte e dependente de `monitoramento-processual`, que passa
  a ter o rotulo "Monitoramento processual (DataJud)".
- Busca por numero de processo, so no Flow. A busca por OAB continua exclusiva
  do produto Juridico.
- Mesmo acompanhamento por processo (um por cliente e numero), com duas fontes
  independentes por acompanhamento: DataJud e DJEN, cada uma ligada ou desligada
  e com frequencia propria. DataJud: 1, 7, 14 ou 30 dias. DJEN: 1, 3 ou 7 dias
  uteis (sem 14/30, para nao perder prazo curto de intimacao).
- Padrao do DJEN: segue a capacidade quando o destino e o Flow (ligado e diario
  com a capacidade contratada); destino Juridico fica sem DJEN.
- Ciclo diario: o workflow do acompanhamento acorda todo dia util as 7h
  (Brasilia), pergunta ao BFF quais fontes venceram e dispara cada uma na sua
  fila Temporal: `process-monitoring` (DataJud, uma por vez) e
  `process-publications` (DJEN, ritmo proprio). A falha de uma fonte nao bloqueia
  a outra. Frequencia e liga/desliga passam a valer no ciclo seguinte, sem
  reiniciar o workflow (corrige o defeito da cadencia que so valia apos
  reinicio).
- Publicacoes: texto convertido para texto puro no BFF (nunca HTML do provedor
  na tela) e guardado cifrado no banco da capacidade; apagado com o
  acompanhamento. A primeira consulta do DJEN cobre os ultimos 7 dias e so
  estabelece a base (lista, sem evento); as seguintes trazem o que saiu desde a
  ultima consulta, e as novas viram evento no historico do card.
- Mudanca de vara entre movimentacoes do DataJud vira um item proprio
  ("Mudanca de vara: X -> Y") na lista; depois da base, tambem evento no card.
- Fila externa (RabbitMQ, Redpanda, Valkey) continua descartada.

## Alternativas Descartadas

- Consultar o DJEN quando o DataJud mudar: o DataJud chega dias depois e falha
  mais; atrasaria a intimacao.
- DJEN configurado por coluna, board ou card como automacao de busca: a busca
  dependeria de onde o card esta. A automacao fica para reagir a publicacao.
- Busca automatica do passado inteiro: o historico anterior vira consulta sob
  demanda ("Ver no DJEN" na movimentacao).

## Consequencias

- Novo tipo de evento no card (`djen_publication_received`); o gatilho de
  automacao correspondente vem numa sprint propria.
- Dias uteis consideram so fim de semana; feriados ficam fora nesta decisao.
- O limite de pedidos da API do DJEN nao e documentado; ritmo inicial de 2
  consultas por segundo, configuravel.

## Pendencias

- Resolvidas nas Sprints 8 e 9 (docs/product/process-monitoring-sprints.md):
  gatilho "Publicacao recebida (DJEN)", "Ver no DJEN" sob demanda (conferido na
  tela em 2026-11-09) e data de ajuizamento no card.
- Contador de publicacoes nao vistas no cabecalho do card.
- Feriados no calculo de dias uteis.
