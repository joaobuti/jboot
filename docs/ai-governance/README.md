# AI Governance

## Objetivo

Registrar e validar execucoes de IA no JBoot com rastreabilidade minima.

## Componentes

- `records/decisions`: decisoes estruturadas.
- `records/executions`: execucoes estruturadas.
- `records/non-conformities`: falhas de processo.
- `metrics`: series tabulares de execucoes, custo, tokens, latencia e status.
- `evals`: fixtures e checagens simples.
- `tools/ai/*`: scripts executaveis de validacao.
- `conformance`: profile canonico, thresholds e claim normativo.
- `schemas`: contratos JSON Schema 2020-12.
- `attestations`: proveniencia estruturada por execucao.
- `security`: threat model agentico e matriz de autoridade.
- `evidence`: evidence pack reproduzivel por revisionamento.

## Regras

- Toda implementacao funcional deve ter `Agent Activation`.
- Toda sprint funcional deve ter gate.
- Toda mudanca de arquitetura deve ter ADR/decision record.
- Toda nao conformidade deve ser registrada.

## Comandos

```bash
make ai-check
make ai-conformance
make ai-diff-check
make ai-evidence
make ai-api-graph            # rotas x consumidores; VERBOSE=1 lista info e aceitos
make ai-api-graph-gate       # bloqueante (parte de ai-check)
make ai-api-impact           # consumidores afetados pelo diff; BASE=origin/main para o MR
make ai-api-context MODULE=kanban   # recorte da superficie HTTP para preflight de agent

tools/ai/validate-runtime-adapters.sh
tools/ai/validate-contract-adapters.sh
tools/ai/generate-ai-context.sh --force
tools/ai/preflight-check.sh --project implementations/bff-jboot-platform --module modules/pdv --gate docs/product/pdv-sprint-1-gate.md --activation-file docs/ai-governance/evals/sample-agent-activation.txt
tools/ai/run-evals.sh
tools/ai/governance-report.sh
tools/ai/record-execution.sh --title "descricao curta" --project implementations/bff-jboot-platform --module modules/pdv --mode implementation --status success --validations "make ai-check"
```

## Integracao Local

Antes de iniciar uma sprint funcional ou alterar codigo em `implementations/*`, execute:

```bash
make ai-check
```

Esse comando valida:

- adapters de runtime;
- consistencia minima entre contratos e adapters;
- preflight de exemplo com `Agent Activation`;
- evals de governanca.

Ele nao substitui o `Agent Activation` real da tarefa. Ele apenas garante que a estrutura de governanca esta integra antes da execucao.

## Metricas

Use `tools/ai/record-execution.sh` ao final de execucoes relevantes. O script cria:

- registro legivel em `docs/ai-governance/records/executions`;
- linha tabular em `docs/ai-governance/metrics/ai-executions.tsv`.

Campos de tokens, custo e latencia sao preenchidos quando o runtime os expuser.
Quando nao houver medicao automatica, use `null` na attestation e um
`measurement_status` explicito. Zero significa valor efetivamente medido.

### Indicadores Operacionais

Execute `make ai-report` para obter, no minimo:

- total de execucoes registradas;
- taxa de sucesso e execucoes nao concluidas;
- cobertura de medicao de tokens e latencia;
- quantidade de registros de nao conformidade.

Interpretacao operacional:

- `non_success > 0`: revisar os registros correspondentes antes de repetir o fluxo;
- cobertura zero de tokens/latencia: telemetria do runtime ainda nao integrada;
- nova nao conformidade: definir owner, correcao e teste de regressao no proprio registro;
- divergencia de contrato/inventario: bloqueante, pois `make ai-check` deve falhar.

Os indicadores medem aderencia do processo; qualidade funcional continua
dependendo dos testes do dominio. O claim AI-first engineering exige tambem o
profile, evals, freshness, lifecycle, seguranca e evidence pack.
