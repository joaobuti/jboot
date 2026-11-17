# AI Architecture Maturity Checklist

## Status Atual

O projeto ja possui:

- regra de ouro global;
- agents de orquestracao;
- catalogo de stacks;
- contratos por projeto;
- contratos por modulo platform;
- skills locais por projeto/modulo;
- gate minimo antes de sprint funcional;
- obrigatoriedade de `Agent Activation`;
- adapters iniciais para Codex, Claude, Cursor e GitHub Copilot.
- validador inicial em `tools/ai/validate-runtime-adapters.sh`.
- validador semantico inicial em `tools/ai/validate-contract-adapters.sh`.
- checklist executavel em `tools/ai/preflight-check.sh`.
- evals positivos e negativos em `tools/ai/run-evals.sh`.
- geracao automatica de `AI_CONTEXT.md` por `tools/ai/generate-ai-context.sh`.
- registro estruturado em `docs/ai-governance/records/*`.
- metricas tabulares em `docs/ai-governance/metrics/ai-executions.tsv`.
- CI de governanca em `.github/workflows/ai-governance.yml`.

## Controles Implementados E Evolucao

| Area | Falta | Prioridade |
|---|---|---|
| Profile canonico | Implementado em YAML, com JSON Schema e thresholds. | Concluido |
| Runtime adapters | Cobertura semantica dos controles bloqueantes validada em CI. | Concluido |
| Execucao | Preflight real baseado em diff e attestation versionada. | Concluido |
| Avaliacao | Evals deterministas, negativos, adversariais e regressao de nao conformidades. | Concluido |
| Memoria operacional | Proveniencia estruturada; metricas indisponiveis usam status explicito. | Concluido |
| Contexto | Geracao deterministica com digest e freshness check. | Concluido |
| Seguranca | Threat model agentico e matriz de autoridade de tools. | Concluido |
| Lifecycle | Projetos e modulos ativos possuem status e evidencia. | Concluido |
| Multi-runtime | Controles comuns validados; live eval depende da capacidade/credencial de cada runtime. | Evolucao nao bloqueante |
| Hosting | Required checks/branch protection devem ser confirmados no provedor Git. | Controle externo |

## Proximo Nivel Recomendado

1. Confirmar branch protection e required checks nos provedores Git.
2. Adicionar live evals agendados quando cada runtime expuser API e budget.
3. Coletar tokens/custo/latencia automaticamente quando o runtime expuser.
4. Evoluir os testes arquiteturais por dominio sem reduzir os gates atuais.
