# Consumo de IA por cliente e aplicacao — sprints

Branch: `feature/ai-usage-metering` (a partir de `main` 03627047b).
Comando: `/jboot-plan-feature` (planejamento; nenhum codigo nesta etapa).

## Decisoes confirmadas pelo usuario (2026-11-14)

- Visibilidade: **ambos**. O operador do JBoot ve o consumo de todos os
  clientes; o admin de cada cliente ve apenas o consumo do proprio cliente.
- Finalidade: **somente monitorar**, por enquanto. Sem cobranca, repasse,
  fechamento por periodo ou cota que bloqueie execucao. Se isso mudar, reabrir
  o plano (moeda, auditoria de custo, chave de IA propria do JBoot).

## Estado atual (levantado em 2026-11-14)

- Toda chamada de IA por API passa pelo `svc-jboot-ai-gateway`
  (`bff-jboot-platform` chama `/v1/executions`; nenhum outro projeto chama
  OpenAI/Anthropic direto). Interacoes manuais usam o mesmo ledger.
- Ledger `ai_executions` (banco `jboot_ai_gateway`) ja grava por execucao:
  `client_id`, `application_slug`, `agent_id`/`agent_version`, `provider`,
  `model`, `requester_identity_id`, `source_type`/`source_id`, `status`,
  `latency_ms`, `input_tokens`, `output_tokens`. Indice
  `(client_id, application_slug, created_at DESC)`.
- Lacunas:
  1. Tokens cobrados e perdidos em falha: os adapters validam a resposta antes
     de ler `usage`; resposta incompleta/invalida (`ai_output_incomplete`,
     `ai_output_schema_mismatch`, `ai_output_invalid`, `ai_output_too_large`)
     vira `failed` sem tokens, embora o provider tenha cobrado.
  2. Tokens de cache (Anthropic `cache_read_input_tokens`,
     `cache_creation_input_tokens`; OpenAI `input_tokens_details.cached_tokens`)
     e de raciocinio (OpenAI `output_tokens_details.reasoning_tokens`) nao sao
     lidos.
  3. `estimated_cost` e gravado sempre `NULL` (sem tabela de preco).
  4. Agentes `claude_routine` (assinatura Claude) nao expoem tokens ao JBoot;
     so a contagem de disparos e mensuravel.
- O contrato do gateway lista "quotas, custos ... e observabilidade produtiva"
  em Bloqueios De Producao; esta feature cobre a parte de medicao.
- Producao (VPS) esta com `AI_GATEWAY_EXECUTION_ENABLED=false`.

## Escopo

Dentro:

- medicao completa de tokens por execucao, inclusive cache, raciocinio e
  execucoes que falham depois da resposta do provider;
- custo estimado em USD a partir de tabela de preco versionada por data;
- consulta agregada por cliente, aplicacao, agente, provider, modelo e
  periodo;
- visao do operador (todos os clientes) e do admin do cliente (so o proprio);
- painel e alertas operacionais no Grafana.

Fora:

- cobranca, repasse, conversao de moeda, fechamento mensal e auditoria
  contabil;
- cota que bloqueia execucao;
- estimativa de tokens para rotinas da assinatura Claude;
- consumo do Claude Code/assinaturas dos usuarios fora do JBoot.

## Criterios de aceite

1. Toda execucao `api` concluida ou falha apos resposta do provider grava os
   tokens informados pelo provider, separados por tipo (entrada, saida, cache
   lido, cache criado, raciocinio). Sem estimativa por tamanho de texto.
2. Execucao com modelo presente na tabela de preco vigente grava
   `estimated_cost` em USD; modelo sem preco continua `NULL` (regra do
   contrato do gateway mantida).
3. Admin de um cliente nunca ve consumo de outro cliente (teste negativo de
   tenant obrigatorio).
4. Operador ve totais por cliente, aplicacao, agente, modelo e dia/mes.
5. Agentes `claude_routine` aparecem como contagem de disparos, sem tokens.
6. Painel no Grafana com os mesmos totais da API para o mesmo periodo.
7. Nenhum prompt, input, output ou credencial em metricas, logs ou visao de
   consumo.

## Sprints

| Sprint | Projeto | Entrega | Estado |
|---|---|---|---|
| S1 | `svc-jboot-ai-gateway` | Captura completa de tokens: colunas por tipo de token; leitura de `usage` antes da validacao da saida; gravar tokens em `failed` quando o provider respondeu | pendente |
| S2 | `svc-jboot-ai-gateway` | Tabela de preco por provider/modelo/tipo de token com vigencia; calculo de `estimated_cost` na conclusao | pendente |
| S3 | `svc-jboot-ai-gateway` | API de consumo agregado com autorizacao: operador (global) e admin do cliente (proprio `client_id`); contrato OpenAPI | pendente |
| S4 | `ops-jboot-observability` | Visao somente leitura no banco do gateway + datasource Postgres + painel e alertas de pico por cliente no Grafana | pendente |
| S5 | `app-jboot-identity-admin` e `app-jboot-next-platform` (modulo do Flow) | Tela "Consumo de IA": operador no Identity Admin; admin do cliente na Platform. Exige `docs/agents/orchestration/ui-ux.md` antes | pendente |

Backend e frontend da mesma entrega seguem como fluxo unico, com o contrato da
API (S3) congelado e commitado antes da S5.

## Testes exigidos

- S1: respostas reais capturadas da OpenAI e da Anthropic (anonimizadas, com
  endpoint, modelo e data da captura) como fixtures, incluindo campos de cache
  e raciocinio e um caso de saida invalida com `usage`; regressao para tokens
  em `failed`. Fixture escrita a mao nao vale como evidencia.
- S2: preco por vigencia (troca de preco no meio do periodo), modelo sem preco.
- S3: isolamento de tenant (admin de A pedindo B), operador global, periodo,
  agrupamentos; `make ai-api-graph-gate`.
- S4: consulta do painel batendo com a API para o mesmo periodo.
- S5: type-check e build no container; telas seguindo o preset do template.

Todos os testes rodam no container `jboot`.

## PE Decision

```text
execution_mode: planning (/jboot-plan-feature)
delivery_type: feature cross-project em projetos existentes (backend, dados, observabilidade, UI)
target_project: implementations/svc-jboot-ai-gateway (principal)
target_module: none (servico sem modulos)
secondary_targets:
  - implementations/ops-jboot-observability (S4)
  - implementations/app-jboot-identity-admin (S5, visao do operador)
  - implementations/app-jboot-next-platform, modules/kanban (S5, visao do admin do cliente)
sprint_artifact: docs/product/ai-usage-metering-sprints.md
sprint_gate: criterios de aceite deste documento, por sprint
stack_fit_gate: nao se aplica (nenhuma unidade nova de build/runtime/deploy)
deployment_boundary_gate: cada entrega fica no processo do projeto que ja a hospeda e herda sua stack
open_questions: ver tabela abaixo
blocking_status: liberado para S1-S4; S5 depende de ui-ux e de Q3
graph_steward_required: false
graph_steward_trigger: nenhum (adicao rotineira de capability e arestas em projetos existentes)
```

Grafo de arquitetura planejado: node `capability:ai-usage-metering` (owner
`ai-gateway`, lifecycle `planned` ate a S3), arestas
`project:svc-jboot-ai-gateway` -> capability e
`project:ops-jboot-observability` -> capability (leitura); endpoints da S3
derivados pelo API Contract Graph.

## Decisao de arquitetura (Architect)

- Fonte da verdade do consumo: o ledger `ai_executions` do gateway. E o unico
  ponto por onde toda chamada de API passa e ja tem tenant e aplicacao.
- Metricas OpenTelemetry: so para alertas operacionais, nao para totais.
  Metricas podem perder pontos e rotulo por cliente cresce sem limite com o
  numero de clientes.
- Grafana le uma visao agregada somente leitura (usuario de banco proprio, so
  `SELECT` na visao), nunca as tabelas do gateway. Isso cruza a fronteira
  entre o stack de observabilidade e o banco do gateway; registrar no contrato
  dos dois projetos.
- Telas consomem a API da S3; nao leem banco.

## Perguntas abertas

| # | Pergunta | Impacto | Estado |
|---|---|---|---|
| Q1 | Quem ve o consumo | escopo, permissao, UI | respondida 2026-11-14: operador e admin do cliente |
| Q2 | Finalidade | precisao, moeda, cota | respondida 2026-11-14: somente monitorar |
| Q3 | Onde fica a tela do admin do cliente na Platform: dentro do Flow (unico modulo que usa IA hoje) ou numa area comum a todos os modulos | S5, navegacao | aberta, nao bloqueia S1-S4 |
| Q4 | Fonte da tabela de preco: cadastro manual pelo operador (recomendado) ou arquivo versionado no repositorio | S2 | aberta, nao bloqueia S1 |
| Q5 | Captura das respostas reais para fixtures exige ligar a execucao num ambiente de teste com chave real | S1 | aberta, bloqueia o fechamento da S1 |

## Planned Agent Activation

```text
using_agent:
  - implementations/svc-jboot-ai-gateway/agents/ai-gateway-backend.md (S1-S3)
  - agents locais de ops-jboot-observability (S4)
  - docs/agents/orchestration/ui-ux.md e agents frontend-* locais (S5)
using_skill:
  - implementations/svc-jboot-ai-gateway/skills/byok-credential-vault.md (referencia de isolamento por tenant)
  - docs/skills/security-checklist/SKILL.md
  - skills/platform-crud-ui.md quando a tela da Platform for listagem administrativa
referenced_only:
  - docs/agents/orchestration/architect.md
not_using:
  - ai-graph-architect (sem trigger estrutural)
```
