# Flow CRM De Leads — Gate Das Sprints 4 A 9

## Status

- PE Decision: 2026-10-11 (product-engineer), sobre a "Redefinicao Da Primeira
  Fase (2026-10-11)" do PO em `docs/product/flow-crm-leads-sprints.md`.
- Architect: **decisao emitida e revista em 2026-10-11** apos as decisoes do
  usuario (escritorios N:N, PDF, chave do cliente); ver "Architect Decision
  (2026-10-11)" e ADR 014 (`proposed`, confirmacao parcial). Deployment
  Boundary e Stack Fit Gate do PE abaixo continuam como entrada historica; em
  conflito, prevalece a secao do Architect.
- Confirmacao humana: **pendente** (lista em "Decisoes Que Exigem Confirmacao
  Humana").
- Implementacao: S3.5 e S4 concluidas em 2026-10-12 (ver "Entrega" de cada
  sprint no artefato); contratos do kanban atualizados por sprint. S5-S9
  pendentes.
- S4 -> S7 (gatilho da IA, registrado em 2026-10-12): o estado `enviado` e a
  transacao de `LeadsRepository.submit` (`implementations/bff-jboot-platform/src/modules/kanban/leads/leads.repository.ts`)
  sao o ponto de acoplamento: a S7 cria ali a linha de outbox
  `kanban_lead_analysis_runs` (`status = queued`, ADR 014 Decisao 3) e
  acrescenta as transicoes de sistema `enviado -> em_processamento ->
  aguardando_revisao | falha_processamento` em `leads/lead-state.ts`. A S4 nao
  tem fila, outbox, relay nem `src/ai`; o reprocessamento manual tambem e S7.
- Sprint artifact: `docs/product/flow-crm-leads-sprints.md`, ja listado em
  `Contratos Obrigatorios` do `bff-jboot-platform/modules/kanban` e citado em
  `Contratos` do `app-jboot-next-platform/modules/kanban`. Este gate ainda nao
  esta listado (mudanca proposta).

## Escopo

Sprints 4 a 9 do artefato: envio completo do lead e fila do gestor (S4), tipos
de caso e modelos (S5), geracao do documento com classificacao manual (S6),
leitura/extracao por IA (S7), classificacao por IA (S8) e orquestracao ponta a
ponta (S9). Tudo no modulo `kanban` (Flow); sem modulo `juridico`, sem worker
juridico (decisao de 2026-10-09, mantida em 2026-10-11).

Projetos afetados:

- `implementations/bff-jboot-platform` — `modules/kanban` (S4-S9) e, a partir
  da S7, a fronteira compartilhada `src/ai/` (projeto).
- `implementations/app-jboot-next-platform` — `modules/kanban` (telas S4-S9).
- Condicional (G2, P9): conversor `.docx -> PDF` como unidade de infra separada.
- Condicional (G3, P5): unidade independente de OCR/inferencia se o dado nao
  puder sair para provedor externo.

## PE Decision

```text
PE Decision:
  objective: primeira fase do CRM de leads no Flow — envio completo pelo escritorio, fila do gestor, tipos de caso/modelos, geracao revisavel do documento e leitura/classificacao por IA
  execution_mode: cross_project (bff + app da Platform); architectural para S7-S9 (nova integracao com provedor de IA)
  delivery_type: feature de modulo existente (S4-S6) + integracao de IA (S7-S9)
  target_project: implementations/bff-jboot-platform | implementations/app-jboot-next-platform
  target_module: modules/kanban (ambos)
  lifecycle_status: modules/kanban (bff e app) = functional, production_readiness not_assessed; inalterado por este gate. Itens S4-S9 = planned
  context_scope: contratos de projeto/modulo kanban, sprint artifact, kanban-sprint-8/9-gate, docs/agents/stacks/ai-llm.md, platform-object-storage.md, backend-python.md, ADR 003/009/013, decisao 2026-10-06 (graph), make ai-api-context MODULE=kanban (67 rotas, 0 achado ativo)
  deployment_boundary_gate: ver secao propria (S4, S5, S6-docx, S8, S9 = embedded_module; S6-PDF e S7 = pendente de insumo, podendo virar independent_unit)
  stack_fit_gate: G1 docx (recomendacao condicionada a P2), G2 PDF (pendente P9), G3 leitura/OCR (pendente P4/P5/P8), G4 provedor LLM (pendente P5/P7/P8/P19), G5 orquestracao (recomendacao, confirmar no Architect)
  sprint_artifact: docs/product/flow-crm-leads-sprints.md
  sprint_gate: docs/product/flow-crm-leads-sprint-4-9-gate.md (este arquivo)
  architect_required: sim — fila/estado do lead, storage de modelos, biblioteca docx, conversor PDF, fronteira e provedor de IA, reabertura de src/ai
  human_confirmation: obrigatoria antes de qualquer codigo de S4 (premissas) e antes de S7 (IA)
  open_questions_decision: P1-P21 do PO revistas + PE1-PE14 tecnicas; ver Open Questions
  screen_route_impact: rota nova /flow/leads (fila do gestor) e item de menu; configuracao por tenant (tipos de caso, modelos, campos obrigatorios); paineis novos no CardModal ("Envio", "Analise", depois "Leitura"); ui-ux obrigatorio antes do frontend de cada sprint
  rejected: column-automation action_type como gatilho principal da IA; CardAttachment/feed do card para rascunho, extracao ou classificacao; LLM com tools/agente autonomo; LibreOffice dentro do processo platform-api; docx-templates (executa JS do modelo); OpenRouter para dado pessoal
```

### Agent Activation (planejada, por sprint)

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/kanban
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md: padrao NestJS/TS
    - implementations/bff-jboot-platform/agents/platform-auth-context.md: flow:admin, membresia, tenant
    - implementations/bff-jboot-platform/agents/platform-postgres.md: migrations no banco dedicado do Flow
    - implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md: dominio do card/lead
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md: OpenAPI por sprint
    - implementations/bff-jboot-platform/modules/kanban/skills/kanban-board-crud.md
    - implementations/bff-jboot-platform/modules/kanban/skills/kanban-realtime.md: notificacao in-app/evento
    - docs/skills/security-checklist/SKILL.md: dado pessoal, upload, autorizacao
  referenced_only:
    - docs/agents/stacks/ai-llm.md: G3/G4 (S7+)
    - docs/agents/stacks/platform-object-storage.md: modelos e documentos gerados
    - docs/agents/stacks/backend-python.md: candidato em G3 se independent_unit
    - docs/skills/dev-runtime-profile: somente se G2/G3 trouxerem container/env novo
  not_using:
    - agent/skill local de IA: nao existe; deve ser criado antes da S7 (ver mudancas propostas)

Agent Activation:
  project: implementations/app-jboot-next-platform
  module: modules/kanban
  using_agent:
    - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
    - implementations/app-jboot-next-platform/agents/platform-layout.md: item de menu /flow/leads
    - implementations/app-jboot-next-platform/agents/backend-contract-client.md: kanban-api.ts
    - implementations/app-jboot-next-platform/modules/kanban/agents/kanban-board-ui.md
  using_skill:
    - implementations/app-jboot-next-platform/skills/next-module-pattern.md
    - implementations/app-jboot-next-platform/skills/platform-design-system.md
    - implementations/app-jboot-next-platform/skills/platform-crud-ui.md: tipos de caso, modelos, campos obrigatorios
    - implementations/app-jboot-next-platform/skills/api-client.md
    - implementations/app-jboot-next-platform/modules/kanban/skills/kanban-board-ui.md
  referenced_only:
    - docs/agents/orchestration/ui-ux.md: obrigatorio antes do frontend de cada sprint
```

Ordem por sprint: backend (migration, servico, testes, OpenAPI congelado) ->
`ui-ux` -> frontend -> gates no container -> `make ai-api-graph-gate`. Sem
backend e frontend em paralelo antes do contrato HTTP congelado e commitado.

## Deployment Boundary Gate

| Componente | Sprint | Classificacao | Evidencia | Stack |
|---|---|---|---|---|
| Estado do lead, envio completo, devolucao, fila do gestor, notificacao | S4 | `embedded_module` | CRUD e maquina de estado sobre o banco dedicado do Flow; mesma autorizacao (membresia, `flow:admin`) e mesmo modulo de notificacao in-app; nenhum requisito de runtime, escala ou isolamento diferente do kanban | `inherited_from_host` (NestJS/TS, Postgres dedicado) |
| Tipos de caso, modelos, versoes, catalogo de variaveis | S5 | `embedded_module` | Configuracao por tenant no banco do Flow; arquivo no MinIO ja usado pelo modulo; leitura do `.docx` (ZIP+XML) e CPU leve e limitada | `inherited_from_host`; biblioteca em G1 |
| Geracao `.docx` a partir do modelo | S6 | `embedded_module` | Preenchimento de template em JS e da ordem de milissegundos; o dono dos dados (cliente, caso, extracao) e o proprio kanban; um unico consumidor | `inherited_from_host`; biblioteca em G1 |
| Conversao `.docx -> PDF` | S6 (P9) | **pendente de insumo (P9)**; se PDF for obrigatorio = `independent_unit` de infra | Conversao fiel de `.docx` exige LibreOffice (binario nativo, picos de CPU/memoria, superficie de parsing de arquivo nao confiavel). Rodar `soffice` dentro do processo/container `platform-api` e um segundo runtime no host, vedado pelo gate | G2 |
| Leitura/OCR e extracao | S7 | **pendente de insumo (P5, P4, P8)** | Cenario A (P5 permite provedor externo com entrada multimodal): chamadas HTTP I/O-bound, cabem no worker BullMQ in-process -> `embedded_module`. Cenario B (dado nao pode sair, ou OCR local): CPU/GPU-bound; competiria com o event loop que atende PDV/checkout, juridico e comanda no mesmo processo (ADR 003: deploy da platform afeta todos os modulos) -> `independent_unit` com Stack Fit Gate greenfield | G3 |
| Classificacao | S8 | `embedded_module` (provedor em G4) | Chamada de texto curta sobre extracao estruturada + catalogo do tenant; pode ir pseudonimizada (classificacao nao precisa de CPF/nome). Se P1 mostrar criterios deterministicos, regra em codigo + LLM so no residual | `inherited_from_host` |
| Orquestracao | S9 | `embedded_module` | 3 etapas (extrair -> classificar -> gerar) com espera humana modelada como estado no banco, nao como timer de workflow; BullMQ sobre Valkey ja e infra obrigatoria e excecao aprovada (Sprint 8); idempotencia pelo banco | `inherited_from_host`; mecanismo em G5 |

Observacoes de fronteira:

- O processo `platform-api` ja tem worker BullMQ in-process
  (`kanban-column-automation`, Sprints 8/9). A analise do lead NAO deve
  dividir essa fila: jobs de IA sao longos (dezenas de segundos), custam
  dinheiro por tentativa e tem politica de retry diferente (G5).
- Isolamento de dado pessoal: no cenario A a fronteira de risco e o provedor
  (DPA, retencao, regiao), nao o processo; uma unidade separada que chama o
  mesmo provedor nao reduz exposicao. O que reduz: payload de job so com ids
  (nunca conteudo/PII no Valkey), LLM sem tools, chave do provedor usada so pela
  fronteira `src/ai/` com allowlist de chamador e orcamento por `client_id`.
- Memoria: documentos ate 25 MB carregados no processo; o worker de analise
  precisa de concorrencia limitada e streaming para o provedor quando possivel.

## Stack Fit Gate

### G1 — Biblioteca De Template `.docx` (S5/S6, in-process)

Status: **recomendacao condicionada a P2** (formato `.docx` com variaveis
marcadas). Se P2 disser Google Docs, o gate reabre.

| Candidato | Avaliacao | Decisao |
|---|---|---|
| `docxtemplater` (core open source) | Trata variavel quebrada em varios "runs" do Word; laco/condicao no core (atende N contratos se P3); modulo de inspecao lista as variaveis do modelo (S5); sem execucao de codigo do modelo | Recomendado (verificar licenca e versao na implementacao) |
| `easy-template-x` | Mesmo modelo de tags, comunidade menor, menos recursos de inspecao | Alternativa |
| `docx-templates` | Executa JavaScript embutido no modelo; modelo vem do tenant (entrada nao confiavel) | Rejeitado (seguranca) |
| `carbone` | Licenca propria e dependencia de LibreOffice para varios recursos | Rejeitado |
| `docxtpl` (Python/Jinja2) | Bom, mas exige runtime Python; sem justificativa com um consumidor e `.docx` apenas | Rejeitado para esta fronteira |

Baseline: nao ha biblioteca `.docx` no repositorio; nenhuma preferencia por
baseline. `counterfactual_choice`: sem baseline de runtime, uma unidade dedicada
de geracao (ex.: Python `docxtpl` + conversor) so venceria com varios
consumidores e PDF obrigatorio; com um consumidor, a biblioteca no host que
detem os dados vence por custo operacional (sem rede, sem segunda copia de PII).

Requisitos de seguranca: parser com limite de descompressao (zip bomb), sem
resolucao de entidade externa, verificacao de assinatura ja existente (T5),
sintaxe de variavel unica e documentada (proposta `{campo.subcampo}`, decisao
do Architect).

### G2 — Conversao Para PDF (S6, P9)

Status: **pendente de insumo (P9)**. Criterios: obrigatoriedade de PDF na
primeira fase, fidelidade de layout dos modelos reais, custo de operar mais um
container, dado pessoal fora do processo.

| Candidato | Avaliacao |
|---|---|
| Sem PDF na primeira fase (`.docx` apenas) | Zero infra nova; o escritorio converte no Word |
| Gotenberg (container, API HTTP sobre LibreOffice) | Unidade de infra pronta, sem codigo proprio; isolada do `platform-api`; chamada s2s interna. Novo container no dev e na VPS |
| LibreOffice headless no container `jboot` via processo filho | Segundo runtime no host; picos de CPU no mesmo deploy; rejeitado pelo gate |
| API comercial de conversao | Documento pessoal sai para mais um terceiro; so com P5 favoravel; rejeitado por padrao |

`counterfactual_choice`: Gotenberg, se PDF for obrigatorio. Recomendacao do PE:
S6 entrega `.docx` (rascunho e aprovado) e PDF entra como item separado apos
P9 + Architect + confirmacao humana do container novo.

### G3 — Fronteira E Mecanismo De Leitura/Extracao (S7)

Status: **pendente de insumo (P5, P4, P8; P7 informativo)**. Sem escolha
fechada.

| Cenario | Quando | Fronteira | Candidatos |
|---|---|---|---|
| A. Provedor externo multimodal | P5 permite envio a provedor com DPA/sem treino/retencao aceitavel | `embedded_module` (`src/ai/` + worker in-process) | Leitura direta de imagem/PDF pelo modelo (G4); PDF com camada de texto (ex.: HISCON/HISCRE) extraido localmente antes, para reduzir custo |
| B. Dado nao pode sair | P5 proibe provedor externo | `independent_unit` (servico/worker de inferencia) | Python (FastAPI/worker + Tesseract/PaddleOCR/docTR + modelo local via Ollama/vLLM) vs Node (tesseract.js + Ollama); exige host com GPU — a VPS prevista (KVM 8, sem GPU) nao atende modelo de visao com latencia aceitavel |
| C. Hibrido | P5 permite so texto pseudonimizado | OCR local = `independent_unit`; LLM de texto = embedded | Mesmos candidatos de OCR do cenario B + G4 |

Criterios de decisao (medidos, nao presumidos): `field_accuracy`,
`exact_match` e `hallucination_rate` por tipo documental na amostra real
anonimizada (P4) com minimo de P17; legibilidade de foto de celular (RG/CNH,
comprovante); custo por lead no volume de P8 dentro do teto de P19; tempo
envio -> resultado; conformidade de P5. `counterfactual_choice`: cenario A
quando P5 permitir (nao ha OCR nem provedor no repositorio, logo nao ha vies de
baseline); cenario B tem Python como escolha contrafactual pelo ecossistema de
OCR.

### G4 — Provedor De LLM (S7/S8)

Status: **pendente de insumo (P5, P7, P8, P19)**. Nenhum provedor de IA existe
no repositorio; nao ha baseline.

| Candidato (catalogo `ai-llm.md`) | Observacao |
|---|---|
| Anthropic API | Entrada de PDF/imagem e saida estruturada; avaliar retencao/regiao contra P5 |
| OpenAI API | Idem |
| Google Vertex AI / Gemini | Multimodal forte; avaliar regiao/retencao contra P5 |
| Ollama (self-hosted) | So no cenario B; exige GPU |
| OpenRouter | Rejeitado para dado pessoal: adiciona um intermediario de processamento |

Provedores fora do catalogo (ex.: oferta em nuvem com processamento no Brasil)
so entram se P5 exigir e o Architect atualizar o catalogo. Decisao por eval
comparativo de pelo menos dois candidatos na amostra de P4 (execucao com custo:
exige autorizacao), com metricas exportadas e versionadas. Requisitos
independentes do provedor: prompts versionados em `src/ai/prompts`, saida por
schema validada antes de uso, atributos OTel GenAI + `jboot.ai.prompt.version`
e `jboot.ai.cost`, rate limit e circuit breaker por `client_id`, alerta de
orcamento por `client_id` antes da primeira carga real, timeout e retry
limitado.

### G5 — Orquestracao (S9) E Gatilho (S4/S7)

Status: **recomendacao do PE; decisao do Architect**.

| Candidato | Avaliacao | Decisao |
|---|---|---|
| Ato funcional "Enviar para analise" (S4) grava `system_event` e, a partir da S7, enfileira em fila BullMQ dedicada (`kanban-lead-analysis`, mesmo Valkey, worker in-process proprio com concorrencia e retry proprios) | Atende R1 (nao depende de configuracao de coluna pelo cliente); isola jobs longos e caros dos e-mails da automacao; idempotencia por `(submission_id, etapa, hash de entrada)` no banco | Recomendado |
| `action_type` novo no motor de automacao por coluna | Depende de o cliente configurar a coluna certa (contraria R1); compartilha concorrencia e politica de 5 tentativas com e-mail | Rejeitado como gatilho principal (pode virar atalho opcional depois) |
| Temporal | Duravel, mas infra opcional nova para 3 etapas sem timer longo | Rejeitado na fase 1; reavaliar se etapas > 5 ou com espera temporizada |
| LangGraph / agente autonomo | "IA orquestradora" aqui e pipeline deterministico; agente com tools amplia risco (Excessive Agency) sem ganho | Rejeitado |

`counterfactual_choice`: fila de jobs com estado no banco (mesma recomendacao);
o fato de BullMQ ja existir reduz custo operacional mensuravel (zero container
novo), mas a recomendacao se sustenta pelo modelo de execucao.

## Modelo De Dados Proposto (rascunho para o Architect)

Banco dedicado do Flow; toda tabela com `client_id`; timestamps de auditoria
imutaveis; migrations aditivas e idempotentes.

S4:

- `kanban_boards.lead_intake_enabled boolean NOT NULL DEFAULT false` (PE1).
- `kanban_lead_required_fields (client_id, field_key, created_by, created_at)`,
  `field_key` de whitelist em codigo (P16).
- `kanban_card_leads (card_id PK, client_id, status, current_submission_id,
  updated_at)`; `status` CHECK com o enum completo do PO; ausencia de linha =
  `rascunho`.
- `kanban_lead_submissions (id, client_id, card_id, submitted_by, submitted_at,
  returned_by, returned_at, return_reason)` — um ciclo por envio; CHECK motivo
  sse devolvido.
- Guard `LeadEditLock` chamado por toda mutacao de cadastro/documento do card
  quando `enviado` (P21, PE10), no mesmo espirito do `ChecklistGateService`.

S5:

- `kanban_case_types (id, client_id, name, description, classification_criteria,
  expected_evidence, default_template_id, active, ...)`, nome unico entre ativos.
- `kanban_document_templates (id, client_id, name, active, current_version_id)`.
- `kanban_document_template_versions (id, template_id, client_id, version,
  storage_key, file_name, size_bytes, sha256, status, uploaded_by, created_at)`
  imutavel; `kanban_template_version_variables (version_id, variable_key,
  known, required)`.
- `kanban_case_type_templates (case_type_id, template_id)`.
- Catalogo de variaveis em codigo, versionado.

S6:

- `kanban_lead_cases (id, client_id, card_id, submission_id, case_type_id,
  source manual|ai, decided_by, decided_at, change_reason, superseded_at)` —
  N por lead desde o inicio (premissa P3).
- `kanban_card_generated_documents (id, client_id, card_id, lead_case_id,
  template_version_id, version, origin generated|uploaded_edit, status
  rascunho|aprovado|substituido, storage_key, sha256, filled_variables,
  generated_by, ai_run_id, approved_by, approved_at, created_at)`;
  `filled_variables` guarda valor e origem de cada variavel (R7).
- Objeto em `{client_id}/{card_id}/generated/{document_id}-{nome}` no bucket do
  modulo; nao e `CardAttachment` nem aparece no feed (PE3).

S7-S9 (esboco, depende de G3/G4): `kanban_ai_runs` (etapa, provedor, modelo,
versao do prompt, hash de entrada, status, tokens, custo, latencia, erro; sem
PII), `kanban_document_extractions` + campos normalizados (valor, pagina,
trecho, confianca), `kanban_case_classification_suggestions`; desatualizacao
por hash de entrada (R2).

## Contratos HTTP Planejados

OpenAPI por sprint (`docs/api/flow-crm-leads-sprint-<n>-openapi.yaml`)
congelado antes do frontend. Rascunho:

- S4: `GET|POST .../cards/:cardId/lead` (estado/historico; `submit`),
  `POST .../lead/return` (motivo), `GET /kanban/leads` (fila do gestor,
  filtros quadro/estado/periodo, paginada), `GET|PUT /kanban/lead-settings/
  required-fields`, `leadStatus` em `GET .../cards`, `lead_intake_enabled` no
  `PATCH /kanban/boards/:id` (hoje sem consumidor, aceito como `planned`).
  Erro de envio incompleto: 422 `lead_incomplete` com `missingFields` e
  `pendingDocumentTypes`.
- S5: CRUD `/kanban/case-types`, `/kanban/document-templates`, upload de versao
  (multipart), download assinado, `GET /kanban/template-variables`.
- S6: `GET .../cards/:cardId/analysis`, classificacao manual, gerar, aprovar,
  substituir por upload, download assinado do gerado.
- Notificacoes in-app: `kanban.lead.submitted`, `kanban.lead.returned`,
  `kanban.lead.document_approved` (payload so ids/estado/motivo).

## Autorizacao E Visibilidade (premissas a confirmar)

| Ato | Quem |
|---|---|
| Habilitar captacao no quadro, campos obrigatorios, tipos de caso, modelos | `flow:admin` |
| Enviar para analise | regra das mutacoes de card (`flow:write`, admin/member, coluna editavel) |
| Fila do gestor, devolver, classificar, gerar, aprovar, substituir | `flow:admin` + membro ativo do quadro do card (PE2) |
| Ver estado/pendencias/documento aprovado | membro ativo do quadro (P11) |
| Ver classificacao, rascunho, extracao | somente o gestor (P11, PE3) |
| IA | ator de sistema; nunca aprova, devolve, altera cadastro ou entrega |

## Sprint Gate

| Sprint | Pronta apos confirmacao humana? | Bloqueia de verdade | Premissas temporarias que bastam | Artefatos antes do codigo |
|---|---|---|---|---|
| S4 | Sim | Nenhum insumo do cliente | P10, P11 (parte S4), P13, P16, P21, PE1, PE2, PE10, PE14 | modelo de dados S4, OpenAPI S4, UIUX Decision (fila, menu, painel Envio) |
| S5 | Sim | Nenhum (cadastro funciona vazio; P1 so carrega dados) | P2-formato, P3 (N casos), PE8, PE9 (G1 no Architect) | modelo de dados S5, OpenAPI S5, UIUX Decision (CRUD por tenant) |
| S6 | Sim para iniciar; **conclusao** exige modelo real do cliente (P2) | Modelo real anonimizado para o criterio de aceite | P6, P9 ajustada (PE7: `.docx` apenas), P11, P3, PE3 | modelo de dados S6, OpenAPI S6, UIUX Decision (painel Analise) |
| S7 | Nao | P4 (campos + amostra), P5, G3/G4 no Architect, PE11 (src/ai), PE12/P19 (orcamento), PE13 (onde fica o dataset), S4 concluida | P12 | ADR de provedor/fronteira, agent/skill local de IA, plano de eval |
| S8 | Nao | S7, P1, P3 (multi-rotulo?), P17, gabarito (P4) | P14 | dataset de classificacao, eval |
| S9 | Nao | S6, S7, S8; P2 parte "texto redigido por IA" | P12, P14, PE4, PE5 | eval de geracao (se P2 = sim) |

Gates obrigatorios por sprint: `security-checklist`, testes/type-check/build no
container, `make ai-api-graph-gate`, `ui-ux` antes das telas.

## Graph Engineering

O registry do Architecture Graph (Sprint 4 de `docs/product/api-graph-sprints.md`)
**nao existe**; o Architecture Graph **nao** esta sincronizado. Obrigacao de
migracao registrada aqui, com lifecycle `planned`, owner `kanban` salvo
indicacao:

- `feature`: `flow-crm-leads-phase-1` (`planned_in` este gate e o sprint
  artifact; `part_of` `modules/kanban`).
- `data_store` (banco do Flow): `kanban_card_leads`, `kanban_lead_submissions`,
  `kanban_lead_required_fields` (S4); `kanban_case_types`,
  `kanban_document_templates`, `kanban_document_template_versions`,
  `kanban_case_type_templates` (S5); `kanban_lead_cases`,
  `kanban_card_generated_documents` (S6); `kanban_ai_runs`,
  `kanban_document_extractions`, `kanban_case_classification_suggestions`
  (S7/S8).
- `data_store` existente `kanban-card-attachments` (MinIO): arestas `stores_in`
  novas para modelos (`{client_id}/templates/...`, PE8) e documentos gerados.
- `data_store`/fila: `kanban-lead-analysis` (BullMQ sobre Valkey; S7) — aresta
  `kanban` -> fila (`stores_in`/`consumes`).
- `module`/`capability`: `bff-jboot-platform/src/ai` (owner
  `bff-jboot-platform`, S7) — aresta `kanban` -> `src/ai` (`depends_on`).
- `external_system`: `llm-provider` (a definir em G4) — `src/ai` ->
  `integrates_with`; `ocr-engine` (G3, se separado); `docx-pdf-converter`
  (G2, se aprovado; `deploy_unit` proprio).
- Arestas existentes alteradas: `kanban` -> `establishment-customers`
  (leitura para preencher variaveis); `kanban` -> `notifications` (3 kinds
  novos); `app kanban` -> `bff kanban` (rotas novas, subgrafo HTTP).
- `decision`: este PE Decision; ADR futura de provedor/fronteira de IA.
- `evidence`: resultados versionados de eval (S7/S8).

O API Contract Graph (subgrafo HTTP) continua obrigatorio: toda rota nova com
consumidor em `kanban-api.ts` e gate verde.

## Mudancas Propostas Nos Contratos (nao aplicadas)

Dependem do Architect e da confirmacao humana.

`implementations/bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md`:

- Restricao "Nao usar `src/ai` neste modulo — Kanban nao tem feature de IA":
  **reabrir no inicio da S7** (S4-S6 nao precisam). Texto proposto: IA do
  modulo somente pela fronteira `src/ai/` (providers, prompts, evals) e por
  `src/modules/kanban/ai/` (prompts e schemas de dominio); SDK de provedor so em
  `src/ai/providers`; LLM sem tools; saida validada por schema; payload de job
  so com ids; nenhum dado pessoal em log, evento, auditoria ou telemetria.
- Secoes novas: "Envio Do Lead E Fila Do Gestor (S4)", "Tipos De Caso E Modelos
  (S5)", "Documento Gerado (S6)", "Analise Por IA (S7+)", com as regras de
  autorizacao/visibilidade acima.
- Restricao "Documento de checklist reutiliza `CardAttachment`...": esclarecer
  que modelos (tenant) e documentos gerados (card) usam o mesmo bucket do
  modulo com prefixos proprios e tabelas proprias, fora do feed.
- Motor de automacao: registrar que a analise do lead usa fila dedicada
  `kanban-lead-analysis` (se G5 aprovado), dentro da mesma excecao de Valkey
  como broker.
- `Contratos Obrigatorios`: incluir este gate, OpenAPI S4-S6 e a ADR de IA.
- Agents/skills: criar `modules/kanban/skills/kanban-lead-intake.md` (S4),
  `kanban-document-templates.md` (S5/S6), `kanban-lead-analysis-ai.md` (S7-S9).
- Dev Runtime Profile: variaveis do provedor e fila (S7); container de G2/G3 se
  aprovado (skill `dev-runtime-profile`).

`implementations/bff-jboot-platform/PROJECT_CONTRACT.md`: entrypoint `src/ai/*`
e agent global `agents/ai-llm-integration.md` (derivado de
`docs/agents/stacks/ai-llm.md`) antes da S7. Drift encontrado: a tabela
`Modulos` nao lista `modules/kanban`.

`implementations/app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md`:
rotas `/flow/leads` e configuracao por tenant (nomes pelo `ui-ux`), paineis do
`CardModal`, item de menu, este gate em `Contratos`. Drift encontrado: a tabela
`Modulos` do `PROJECT_CONTRACT.md` do app nao lista `modules/kanban`.

## Riscos

- P5 negativo empurra S7 para unidade independente com GPU: custo e prazo da
  fase mudam materialmente.
- Avaliacao exige documento real; documento pessoal nao pode ir para o git
  (PE13). Sem dataset fora do repositorio, S7/S8 nao fecham aceite.
- Modelo do escritorio e material confidencial do cliente: fixture de teste
  deve ser sintetica no repositorio, com aceite contra o modelo real executado
  localmente e registrado.
- Cliente final e nucleo compartilhado (PDV, outros cards): o congelamento do
  lead nao impede edicao por outro caminho; mitigado por snapshot em
  `filled_variables` e marca "desatualizado".
- Enqueue fire-and-forget da Sprint 8 nao serve para a analise: envio sem job
  deixaria o lead parado; exigir reconciliacao (varredura de `enviado` sem run)
  ou outbox.
- Custo de IA sem teto por `client_id` pode ser consumido por reprocessamento
  manual repetido; limitar reprocessamento e orcamento.
- Prompt injection por conteudo do documento: mitigado por LLM sem tools,
  schema, tipo de caso restrito ao enum ativo do tenant e nenhuma escrita
  automatica no cadastro.

## Open Questions

Classificacoes do PO mantidas salvo indicacao "(PE)".

| ID | Tema | Classificacao | Bloqueia |
|---|---|---|---|
| P1 | Tipos de caso e criterios | `bloqueante_agora` para S8; nao bloqueia S5 | S8 |
| P2 | Formato do modelo / texto redigido | (PE) dividida: formato = `premissa_temporaria_requer_aprovacao` (S5/S6); texto por IA = `pode_decidir_depois` (antes da S9) | S5, S6, S9 |
| P3 | N casos/documentos por lead | (PE) `premissa_temporaria_requer_aprovacao` para S5/S6 (modelo suporta N); `bloqueante_agora` para S8 | S6, S8 |
| P4 | Campos por documento + amostra/gabarito | `bloqueante_agora` | S7, S8 |
| P5 | Base legal/consentimento, retencao, treino, regiao | `bloqueante_agora` | S7 (e G3/G4) |
| P6 | Revisao humana obrigatoria | `premissa_temporaria_requer_aprovacao` | S6 |
| P7 | IAs usadas hoje | `pode_decidir_depois` (antes do Architect da S7; contrato existente com provedor pesa em P5) | - |
| P8 | Volume | `pode_decidir_depois` (antes do Architect da S7) | G3/G4 |
| P9 | `.docx`/PDF | `premissa_temporaria_requer_aprovacao`, ajustada por PE7 | S6, G2 |
| P10 | Escritorio = quadro no mesmo tenant; gestor | `premissa_temporaria_requer_aprovacao` | S4 |
| P11 | O que o escritorio ve | `premissa_temporaria_requer_aprovacao` | S4, S6 |
| P12 | Disparo automatico | `premissa_temporaria_requer_aprovacao` | S7, S9 |
| P13 | Aceite item a item antes da IA | `premissa_temporaria_requer_aprovacao` (define R1 da S4) | S4, S7 |
| P14 | Classificacao incerta para | `premissa_temporaria_requer_aprovacao` | S8, S9 |
| P15 | Google Drive | `pode_decidir_depois` | - |
| P16 | Campos obrigatorios do envio | `premissa_temporaria_requer_aprovacao` | S4 |
| P17 | Acuracia minima | `pode_decidir_depois` (antes de fechar S7/S8) | aceite S7/S8 |
| P18 | Retencao/expurgo | `pode_decidir_depois` (antes de producao; retencao no provedor entra em P5) | operacao |
| P19 | Quem paga IA, teto | (PE) `bloqueante_agora` para a S7 (orcamento por `client_id` e pre-requisito de `ai-llm.md` antes da primeira carga real) | S7 |
| P20 | Assinatura/protocolo fora | `pode_decidir_depois` | - |
| P21 | Envio congela edicao | `premissa_temporaria_requer_aprovacao` | S4 |
| PE1 | "Enviar para analise" so em quadro com `lead_intake_enabled` (default false), para nao afetar quadros de tarefa de outros tenants | `premissa_temporaria_requer_aprovacao` | S4 |
| PE2 | (Revista pelo Architect em 2026-10-11, P24/P25) Gestor = `flow:admin`, sem exigir membresia (`board_admin` efetivo em todos os quadros); notificacao de envio e fila vao aos administradores lidos do Identity por `FlowAdminDirectory` (ADR 014, Decisao 7) | fechada (tecnica) | S4 |
| PE3 | Rascunho, extracao e classificacao em tabelas proprias com leitura so do gestor; feed do card (visivel ao escritorio) recebe so ids/estado | `premissa_temporaria_requer_aprovacao` | S6, S7 |
| PE4 | Gatilho da IA = ato "Enviar para analise" + fila dedicada `kanban-lead-analysis`, nao `action_type` de coluna | `premissa_temporaria_requer_aprovacao` (Architect) | S7, S9 |
| PE5 | "IA orquestradora" = pipeline deterministico; LLM sem tools | `premissa_temporaria_requer_aprovacao` | S9 |
| PE6 | Fronteira da leitura (cenario A/B/C de G3) | `bloqueante_agora` para S7 (depende de P5/P4/P8) | S7 |
| PE7 | ~~S6 entrega `.docx`; PDF so apos G2~~ **Superada** em 2026-10-11: PDF na S6 via Gotenberg (decisao do usuario; ADR 014, Decisao 2) | fechada | S6 |
| PE8 | Modelos no bucket do modulo com prefixo `{client_id}/templates/` (sem bucket novo) | `premissa_temporaria_requer_aprovacao` (Architect) | S5 |
| PE9 | Biblioteca `docxtemplater` e sintaxe de variavel unica | `premissa_temporaria_requer_aprovacao` (Architect) | S5, S6 |
| PE10 | Congelamento cobre vinculo/edicao do cliente pelo card e envio de documentos; revisao de documento segue permitida; snapshot dos dados usados | `premissa_temporaria_requer_aprovacao` | S4, S6 |
| PE11 | Reabrir a restricao `src/ai` e criar a fronteira compartilhada | `bloqueante_agora` para S7 (Architect + humano) | S7 |
| PE12 | (Revista em 2026-10-11) Rate limit e circuit breaker por `client_id` mantidos; sem teto/orcamento da JBoot (chave do cliente, R10); limite opcional do cliente em analises/mes (P31) com alertas 80%/100% | fechada (tecnica); P31 pendente de aprovacao | S7 |
| PE13 | Dataset de avaliacao com documento real fica fora do git (armazenamento restrito), com manifesto e metricas versionados | `bloqueante_agora` para aceite de S7/S8 | S7, S8 |
| PE14 | Sem IA, `enviado -> aguardando_revisao` acontece quando o gestor gera o primeiro rascunho (S6); S4 implementa `rascunho`/`enviado`/`devolvido` | `premissa_temporaria_requer_aprovacao` | S4, S6 |

## Blocking Status

(Revisto pelo Architect em 2026-10-11.) Nenhuma decisao tecnica aberta para
S3.5-S6. S3.5 depende da aprovacao de P25-P28; S4 depende da S3.5 concluida;
S5 depende de P2a (formato `.docx` com `{{...}}`) e P3; S6 inicia apos S4 e S5
e conclui com modelo real e fontes do cliente. S7-S9 bloqueadas por P4, P5,
P33 e pelos gates G3/G4 (P19 resolvida: chave do cliente).

## Architect Decision (2026-10-11)

Detalhe, alternativas e justificativas: `docs/architecture/decisions/014-flow-lead-analysis-automation.md`
(status `proposed`). Nada aqui autoriza codigo antes da confirmacao humana.

```text
Architecture Recommendation:
  objective: automacao da analise do lead no Flow (envio, fila do gestor, modelos, geracao .docx, leitura/classificacao por IA)
  target_project: implementations/bff-jboot-platform | implementations/app-jboot-next-platform
  target_module: modules/kanban
  deployment_boundary_gate:
    S4, S5, S6-docx, S8, S9: embedded_module, stack inherited_from_host (confirmado)
    S6-PDF: fora da S6; se P9 exigir, Gotenberg como independent_unit de infra (nova confirmacao)
    S7 leitura: embedded_module se P5 permitir provedor externo; independent_unit se (a) P5 exigir processamento proprio, (b) OCR local elevar p95 do event loop > 100 ms, (c) volume P8 exigir escalar separado, (d) stack de OCR exigir outro runtime
  G1/PE9: docxtemplater (core MIT, 3.71.0 verificado) + pizzip (sob MIT); lacos, condicionais e inspect-module no core gratuito; imagem/HTML/XLSX sao PRO pagos e nao sao usados na fase 1
    sintaxe: {{namespace.campo}} (delimitador duplo; diverge de {campo} do PE), sem parser de expressao, sem raw XML, sem filtros (formatacao vem do catalogo)
    upload: assinatura+anti zip-bomb -> macro/OLE/rel. externa -> compilar -> inspect -> catalogo (desconhecida = invalid_variables, inutilizavel) -> render de prova sintetico -> sha256 + versao do catalogo
  G2 (revisto): PDF na S6 (decisao do usuario) = Gotenberg gotenberg/gotenberg:8.37.0-libreoffice, independent_unit de infra, rede interna sem saida, assincrono via outbox, so do aprovado
  G5/PE4/PE5: gatilho = ato "Enviar para analise"; fila dedicada kanban-lead-analysis, worker in-process; pipeline deterministico, LLM sem tools
    perda de job: OUTBOX TRANSACIONAL — kanban_lead_analysis_runs (status queued) criado na transacao do envio/reprocessamento; relay = enqueue pos-commit (jobId = run_id) + varredura repeatable 1-2 min por tenant ativo
    reconciliacao pura rejeitada: infere intencao do estado, nao cobre reprocessamento manual nem distingue "nao deveria processar"
    idempotencia: input_hash por run e por etapa; claim com lease no banco; etapa concluida nao chama provedor de novo; payload so {databaseRef, clientId, runId}
    retries: transitoria 3x por etapa com backoff+jitter; saida invalida 1x; circuito aberto adia sem consumir tentativa; permanente sem retry; prazo do run 15 min
    concorrencia: 2 por processo (env), 1 run por client_id, limitador global do provedor (BullMQ Pro groups nao usado: pago)
    falha visivel: lead falha_processamento + error_code (provider_unavailable, budget_exceeded, invalid_output, deadline_exceeded, document_too_large, internal_error), notificacao in-app, botao Reprocessar limitado
  estado do lead: campo proprio (kanban_card_leads.status), independente de coluna (confirma PE)
  PE8: mesmo bucket kanban-card-attachments, prefixos {client_id}/templates/{template_id}/{version_id}.docx e {client_id}/{card_id}/generated/{id}.docx, sem nome de arquivo na chave, objetos imutaveis; versao do modelo imutavel e FK + sha256 no documento gerado
  G3/G4/PE6/PE11/PE12/PE13: provedor NAO escolhido; arquitetura agnostica fixada (src/ai/providers porta LlmProvider, gateway com CredentialPort da chave do tenant, limite opcional do cliente, rate limit/circuit breaker/kill switch, schema unico revalidado localmente, pseudonimizacao na classificacao, zero PII em log com teste canario, dataset fora do git em armazenamento restrito)
    protocolo de eval: >= 2 provedores elegiveis por P5, pareado, 2 repeticoes; >= 30 docs por tipo, >= 75 nos criticos, >= 100 para alucinacao; >= 20 leads por tipo de caso; decisao: P5 -> alucinacao -> field_accuracy critico (McNemar) -> custo -> latencia; custo ~10^7 tokens de entrada no total, valor pela tabela do dia apos dry-run de contagem; roda na conta do cliente (P33)
    atencao: avaliar com provedor externo usando amostra real ja depende de P5
  contracts: OpenAPI por sprint; ADR 014; ADR complementar de provedor/fronteira apos eval
  rejected: action_type de coluna como gatilho; reconciliacao pura; Temporal/LangGraph; docx-templates; carbone; docxtpl; soffice no container jboot; API comercial de PDF; container LibreOffice proprio; Collabora/OnlyOffice; bucket novo; OpenRouter para dado pessoal; angular-expressions no modelo; papel de admin local sincronizado; Row Level Security nesta fase; CryptoService derivado do jwtSecret para a chave do cliente; URL de provedor informada pelo cliente
  decision_status: partially_confirmed (ver ADR 014, "Status E Confirmacao")
  requires_human_confirmation: true
```

### Ajustes Ao Modelo De Dados Do PE

- `kanban_lead_analysis_runs` (novo, S7): execucao do pipeline e registro de
  outbox (`submission_id`, `trigger auto|manual`, `status`, `input_hash`,
  `lease_until`, `deadline_at`, `error_code`, `requested_by`).
- `kanban_ai_runs` do PE passa a `kanban_ai_calls`: uma linha por chamada ao
  provedor (etapa, provedor, modelo, versoes de prompt/schema, tokens, custo,
  latencia, `error_code`; sem PII). Evita confundir execucao do pipeline com
  chamada.
- `kanban_ai_settings` (novo, S7): `enabled`, teto mensal, limiar de alerta.
- `kanban_document_template_versions`: + `catalog_version`,
  `validation_status (valid|invalid_variables)`, `validation_report` (sem dado
  de cliente). `kanban_card_generated_documents`: + `template_sha256`.

### Fronteira Da Reabertura De `src/ai`

- S4-S6: restricao "Nao usar `src/ai`" permanece. O contrato ganha, a cada
  sprint, a secao funcional correspondente e referencia a ADR 014.
- Inicio da S7 (apos P5, PE11, PE12 confirmados): no mesmo change que cria
  `src/ai`, a restricao e substituida pelas regras da ADR 014 (Decisao 5); a
  fila `kanban-lead-analysis` entra na excecao de Valkey; ADR 014 e este gate
  entram em `Contratos Obrigatorios`; `PROJECT_CONTRACT.md` do bff ganha
  entrypoint `src/ai/*`, agent global de IA e env do provedor; Dev Runtime
  Profile atualizado. Nunca antes: abrir a restricao sem os controles daria
  permissao sem guarda.

### Graph Engineering (revisado)

Lista do PE confirmada, com ajustes (registry inexistente; grafo **nao**
sincronizado; obrigacao de migracao):

- `data_store` adicionados: `kanban_lead_analysis_runs`, `kanban_ai_calls`
  (substitui `kanban_ai_runs`), `kanban_ai_settings`,
  `kanban_template_version_variables`.
- Fila `kanban-lead-analysis`: `data_store` com aresta `stores_in` ->
  `valkey` (infra existente); `kanban` -> fila `stores_in` (produtor e relay)
  e `consumes` (worker).
- `src/ai`: tipo `capability` (fronteira tecnica compartilhada), `part_of`
  `bff-jboot-platform`; `kanban` -> `src/ai` `depends_on`.
- `external_system` `llm-provider`: `planned` com selecao pendente (ADR 014);
  renomeado para o provedor real na ADR complementar.
- `data_store` `ai-eval-dataset` (fora do repositorio, acesso restrito, owner
  `kanban`) com `evidence` de eval `evidenced_by`.
- `decision`: ADR 014 (`decided_by` nas arestas de fila, storage e `src/ai`).
- Nao registrar agora: `ocr-engine` e `docx-pdf-converter` (so apos aprovacao
  de G2/G3; nos especulativos poluem o grafo). Bibliotecas (`docxtemplater`,
  `pizzip`) nao sao nos arquiteturais.

### Revisao Apos As Decisoes Do Usuario (2026-10-11)

Decisoes do usuario: escritorios com usuario em N escritorios (escolha ao
criar o card), `flow:admin` ve todos os quadros, transferencia so pelo admin,
P30 aprovada, PDF na primeira entrega e IA com a chave do cliente. Desenho
completo na ADR 014 (Decisoes 2, 5, 6 e 7).

```text
Architect Decision (revisao):
  S3.5 escritorios: embedded_module, stack herdada
    dados: kanban_offices; kanban_user_offices (N:N, PK client_id+identity_id+office_id); kanban_cards.office_id (nulo ate atribuir); kanban_settings.office_visibility_enabled (default false)
    ponto unico: CardVisibilityService (resolveViewer, requireVisibleCard, visibleCardScope, canSeeCard) + BoardAccessService.resolveEffectiveRole (flow:admin = board_admin efetivo)
      usado por todas as leituras/mutacoes de card, lista/completude/metricas/fila, busca por CPF, realtime (por evento), notificacoes e e-mails de automacao (por destinatario)
      garantia: teste de matriz em banco real + teste estatico de SQL com allowlist; RLS rejeitado nesta fase
    criacao: 1 escritorio = automatico; N = officeId obrigatorio (422 office_required); sem escritorio = 403 user_without_office; admin escolhe qualquer ativo
    migracao: aditiva, sem backfill; chave por tenant desligada = comportamento atual (inclusive sem "admin ve tudo"); atribuicao em lote por quadro; pre-visualizacao de cards e usuarios sem escritorio antes de ligar; desligar = rollback
    cliente (S1): filterVisibleCustomerIds usa visibleCardScope; override (S3) continua para cliente sem card; vinculo cross-office pelo admin exige motivo e auditoria (crossOffice: true)
  lista de admins: JWT flow:admin na requisicao; FlowAdminDirectory (leitura de jboot_identity.entitlements, cache 60 s) fora da requisicao; papel local sincronizado rejeitado (deriva e vazamento por notificacao)
  PDF: Gotenberg gotenberg/gotenberg:8.37.0-libreoffice; rede jboot-pdf-internal internal:true, sem porta publica; cpus 1, mem 1g, pids 256, read_only, cap_drop ALL; basic auth; download-from e webhook desligados
    chamada: outbox (pdf_status pending na aprovacao) + fila kanban-document-pdf, concorrencia 1, fetch multipart para /forms/libreoffice/convert com nome generico, timeout 60 s, 3 tentativas, falha = "PDF pendente" sem desfazer aprovacao
    runtime: target code-up novo kanban-leads (postgres valkey jboot jboot-fiscal minio gotenberg); compose ganha servico e rede; VPS ganha 1 container sem estado; fontes dos modelos reais verificadas na S6
    counterfactual_choice: Gotenberg LibreOffice-only (igual)
  chave do cliente: kanban_ai_settings; cifragem no padrao DataJudMonitorCryptoService (AES-256-GCM, HMAC(chave mestra dedicada, client_id), encryption_key_version) com JBOOT_KANBAN_AI_SECRET_KEY(+_VERSION, +_PREVIOUS para rotacao); nao usar CryptoService derivado do jwtSecret
    nunca exibida (so last4/status), nunca logada (teste canario), lida no momento da chamada, nunca na fila; validada ao salvar com chamada sem PII; endpoint do provedor fixo em codigo
    eval (P33): recomendado na conta do cliente, com consentimento escrito (P5)
  decision_status: partially_confirmed
```

Revisoes de premissas tecnicas do PE: PE2 revista (admin via `flow:admin` e
`FlowAdminDirectory`), PE7 superada (PDF na S6), PE12 revista (sem teto da
JBoot; rate limit e circuit breaker mantidos; limite opcional do cliente P31).
PE1, PE3, PE8, PE9, PE10 e PE14 fechadas como decisao tecnica (sem objecao do
usuario ao bloco de fluxo). PE4/PE5 confirmadas pelo usuario.

Modelo de dados, acrescimos: `kanban_offices`, `kanban_user_offices`,
`kanban_cards.office_id`, `kanban_settings` (S3.5); `kanban_card_generated_documents`
ganha `pdf_status (pending|done|failed)`, `pdf_storage_key`, `pdf_sha256`,
`pdf_attempts`, `pdf_error_code` (S6); `kanban_ai_settings` conforme ADR 014
(S7).

Graph Engineering, acrescimos `planned` (registry inexistente; grafo **nao**
sincronizado):

- `data_store` `kanban_offices`, `kanban_user_offices`, `kanban_settings`
  (S3.5, owner `kanban`); coluna `kanban_cards.office_id` como atributo do no
  `kanban_cards`.
- `deploy_unit` `gotenberg` (container de infra, owner `bff-jboot-platform`,
  S6), `external_system`/imagem `gotenberg/gotenberg:8.37.0-libreoffice`;
  arestas `kanban` -> `gotenberg` `calls` (s2s interno), `gotenberg`
  `deployed_as` container na rede `jboot-pdf-internal`; substitui o no
  condicional `docx-pdf-converter`.
- `data_store` fila `kanban-document-pdf` (`stores_in` -> `valkey`; `kanban`
  produz e consome).
- `data_store` `kanban_ai_settings` com a credencial cifrada de IA do tenant
  (owner `kanban`, S7); aresta `src/ai` -> `kanban_ai_settings` via
  `CredentialPort` (`depends_on`), `llm-provider` `integrates_with` usando a
  credencial do tenant.
- Aresta `kanban` -> `bff-jboot-identity` (dados `jboot_identity.entitlements`)
  `consumes`, somente leitura, pelo `FlowAdminDirectory`.

### Housekeeping Sem Decisao

Corrigir o drift das tabelas `Modulos` dos `PROJECT_CONTRACT.md` (bff e app)
sem `modules/kanban` junto da atualizacao de contrato da S3.5.

## Decisoes Que Exigem Confirmacao Humana

Revista pelo Architect em 2026-10-11 (itens resolvidos pelo usuario removidos:
P6, P9/PE7, P10, P11, P12, P13, P14, P16, P19, P21, P22, P23, P24, P30, PE4,
PE5; premissas tecnicas PE1, PE2, PE3, PE8, PE9, PE10, PE12, PE14 fechadas
pelo Architect).

1. Regras finas de escritorio (P25-P28): so `flow:admin` e administrador;
   chave por tenant com atribuicao em lote; usuario sem escritorio nao ve
   card; quem sai de um escritorio deixa de ser responsavel nos cards dele.
2. Formato do modelo (P2a) e P3: `.docx` com `{{...}}` e N casos por lead.
3. Configuracao de IA (S7): limite opcional em analises/mes (P31), termo de
   responsabilidade (P34), avaliacao na conta do cliente (P33).
4. Insumos do cliente: P1, P2 (modelos reais e fontes), P4, P5 e o
   consentimento para a avaliacao (P33).

Sem decisao: correcao do drift das tabelas `Modulos` dos `PROJECT_CONTRACT.md`
(bff e app) junto da atualizacao de contrato da S3.5.
