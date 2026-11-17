# Stack escolhida antes da fronteira de execucao

date: 2026-10-04
severity: medium
status: corrected
owner: ai-architecture
affected_controls: AIF-EVAL-001, AIF-EVAL-002, AIF-ADP-001
regression_test: AIF-EVAL-NC-006 and AIF-EVAL-ARC-001 in docs/ai-governance/evals/scenarios.yaml

## Ocorrencia

Ao recomendar a arquitetura de uma integracao de pagamentos, a analise favoreceu inicialmente a stack ja usada no JBoot sem classificar antes se a entrega seria modulo do Platform ou servico independente. A regra existente contra escolha automatica da baseline era ampla, mas nao distinguia a fronteira que deve herdar stack daquela que exige avaliacao greenfield.

## Causa raiz

O `Stack Fit Gate` nao possuia um `Deployment Boundary Gate` anterior nem um contrafactual obrigatorio. Isso permitia confundir aderencia legitima ao contrato de um modulo existente com vies de baseline na criacao de uma unidade independente.

## Correcao

- modulo no mesmo processo/runtime/deploy herda a stack e o contrato do host;
- servico, worker, BFF, app ou outra unidade independente reavalia stack como greenfield;
- incompatibilidade entre modulo e host reabre a decisao de fronteira;
- baseline do repositorio compete sem preferencia automatica para unidade independente;
- PE e Architect registram classificacao, evidencia e `counterfactual_choice`.

## Regressao

- `AIF-EVAL-NC-006`: rejeita governanca que permita preferencia de baseline para unidade independente;
- `AIF-EVAL-ARC-001`: exige que modulo embutido herde a stack do host.
