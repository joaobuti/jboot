# Non-Conformity: Fixture De API Externa Fabricada Pelo Agente

date: 2026-09-24
detected: 2026-09-08
severity: medium
status: corrected
owner: ai-governance
regression_test: AIF-EVAL-NC-005 in docs/ai-governance/evals/scenarios.yaml

## Expected

Contrato, DTO, parser e fixtures de uma integracao com API externa refletem o
que a fonte realmente devolve. Testes verdes indicam que o codigo trata o
payload real.

## Actual

Na integracao DataJud (`svc-jboot-juridico-data`, BFF `modules/juridico` e
tela `/juridico/consultas/processo`), o agente escreveu o codigo e as
fixtures. A suite passava, mas consultas contra a API real mostraram:

- `Process.partes`/`PartyDto`/`DataJudParty` modelados sem existir no indice;
  a fixture fabricava o campo e a tela exibia uma secao "Partes" sempre vazia
  (corrigido em `b7f4090fa`);
- indices eleitorais derivados com `.lower()` sem hifen (`api_publica_treac`),
  404 nos 27 TREs, e STF listado sem publicar na API (corrigido em
  `87cafb819`);
- `dataAjuizamento` em `yyyyMMddHHmmss` descartado como `None` por um
  `except ValueError`, deixando todo processo sem data (corrigido em
  `44ca7f63e`);
- campos entregues pela fonte descartados no parse (corrigido em
  `ee41209de`).

Detectado antes do merge em `main`, por conferencia manual do payload bruto
contra a tela.

## Impact

- Testes verdes sem valor de evidencia: validavam a suposicao do agente.
- Deteccao dependeu de verificacao humana manual, nao de gate.

## Root Cause

A fixture foi escrita pelo mesmo agente que escreveu o parser, a partir do que
ele esperava da fonte. Codigo e teste compartilhavam a mesma suposicao, e
nenhuma regra exigia que fixture de fonte externa tivesse origem real.

## Correction

- Regra em `AGENTS.md` e nos adapters Claude, Codex, Cursor e Copilot:
  fixture de API externa vem de resposta real capturada, anonimizada, com
  origem anotada; campo nunca observado em resposta real nao entra em DTO,
  contrato ou tela.
- `implementations/svc-jboot-juridico-data/skills/datajud-contract.md` ganhou
  a restricao e os formatos observados na fonte.
- Eval de regressao `AIF-EVAL-NC-005` verifica a regra na fonte canonica, nos
  adapters e na skill DataJud.

## Prevention

Em integracao nova com fonte externa, capturar respostas reais antes de
escrever DTO e fixture, e conferir o payload bruto contra a tela antes do
merge.
