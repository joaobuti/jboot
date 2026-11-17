# Juridico Official Data Sprints

## Objetivo

Disponibilizar dados judiciais oficiais no modulo Juridico por uma integracao
interna auditavel, sem expor MCP ou providers diretamente ao frontend.

Escopo definido via `PO -> PE -> Architect -> confirmacao humana` em
2026-08-27.

## Projetos E Responsabilidades

| Projeto | Responsabilidade |
|---|---|
| `implementations/svc-jboot-juridico-data` | DataJud, normalizacao, validacao CNJ, rate limit, retry e erros de provider |
| `implementations/bff-jboot-platform/modules/juridico` | Auth de usuario, tenant, auditoria, persistencia futura e facade REST para a UI |
| `implementations/app-jboot-next-platform/modules/juridico` | Consulta manual e apresentacao da fonte/defasagem |
| `implementations/wrk-jboot-juridico` | Temporal, polling duravel e scraping; nao participa da consulta manual da Sprint 1 |

## Decisoes De Escopo Confirmadas

- criar um novo servico REST interno em vez de executar MCP entre frontend/BFF;
- reutilizar seletivamente o upstream MIT fixado em `v0.1.0`/commit
  `dcc1e4dfa0534809958eec05ad094be415ff2ce1`;
- manter o servico stateless na Sprint 1;
- persistir somente auditoria tecnica no BFF na Sprint 1, sem snapshot integral;
- manter MCP, DJe, providers comerciais e calculo de prazos fora da Sprint 1;
- usar `/juridico/consultas/processo` como rota de produto;
- tratar `juridico-data` como capability s2s, sem application/entitlement Identity.

## Sprints

| Sprint | Objetivo | Estado |
|---|---|---|
| 0 | Planejamento, contratos, ADR, provenance e gates | concluida |
| 1 | Consulta DataJud manual ponta a ponta | concluida |
| 2 | Snapshots e monitoramento duravel | concluida |
| 3 | Calculo assistivo de prazos | concluida |
| 4 | Migracao do PJe/DJEN publico para o servico interno | concluida |

### Sprint 0 — Fundacao Governada

**Estado: concluida** (2026-08-27)

Objetivo: deixar todas as decisoes necessarias para codigo funcional
versionadas e verificaveis.

Entregaveis:

- ADR 009;
- contrato e contexto do novo projeto;
- agents/skills locais;
- contratos OpenAPI BFF e servico;
- modelo de dados de auditoria;
- decisao UI/UX da rota de consulta;
- Sprint 1 Gate;
- Dev Runtime Profile planejado;
- `make ai-conformance` aprovado.

Criterios de aceite:

- nenhum codigo funcional ou dependencia upstream instalado;
- todas as perguntas materiais possuem decisao operacional;
- contratos derivados estao atuais;
- branch dedicada criada.

Fora de escopo: runtime, endpoint, migration, tela e clone do upstream.

Evidencia:

- branch `codex/juridico-official-data-service` criada a partir de `main` limpo;
- contratos, OpenAPI, data model, ADR, agents e skills versionados no working tree;
- fluxo, estados, acessibilidade e reuso visual definidos no documento UI/UX;
- contextos derivados regenerados por `make ai-context`;
- `make ai-contract-check` e `make ai-conformance` aprovados.

### Sprint 1 — Consulta DataJud Manual Ponta A Ponta

**Estado: concluida** (2026-08-27)

Objetivo: permitir consulta autenticada por numero CNJ com retorno normalizado e
movimentacoes, sem persistir o conteudo integral.

Fluxos:

1. Usuario com `juridico:read` abre `/juridico/consultas/processo`.
2. Informa numero CNJ e, opcionalmente, tribunal.
3. BFF valida contexto e chama o servico com credencial s2s.
4. Servico consulta DataJud, bloqueia sigilo e normaliza a resposta.
5. BFF grava auditoria sem PII bruta e devolve DTO explicito.
6. UI exibe processo, movimentacoes, fonte, captura e aviso de defasagem.

Criterios de aceite:

- numero CNJ formatado e sem mascara sao aceitos quando validos;
- numero invalido nao chama DataJud;
- tribunal invalido e rejeitado por allowlist;
- processo inexistente, sigiloso, rate limit, timeout e indisponibilidade possuem
  erros estruturados e testados;
- nenhuma URL arbitraria pode ser fornecida pelo cliente;
- logs/traces nao contem numero CNJ, nomes de partes, tokens ou API key;
- front nunca acessa `:8030`;
- testes unitarios e de contrato cobrem service, BFF e client frontend;
- lint, typecheck, testes e builds executam dentro do container do projeto;
- security checklist, auditoria de dependencias, smoke e attestation aprovados.

Fora de escopo:

- busca por CPF/CNPJ, OAB ou nome;
- snapshots integrais e historico local;
- polling/Temporal;
- resumo por LLM;
- calculo de prazo;
- MCP remoto;
- DJe/DJEN autenticado e confirmacao de leitura;
- Judit, Escavador, TrackJud ou outro provider comercial.

Evidencia:

- upstream `v0.1.0`/`dcc1e4d` e MIT verificados em clone temporario;
- API Python com 12 testes, Ruff, mypy, pyright e `pip-audit` aprovados;
- Identity (11 testes) e BFF (177 testes) com lint, type-check e build aprovados;
- frontend com 16 testes, type-check e build aprovados;
- smoke `Identity -> JWT s2s -> Juridico Data` aprovado;
- capability e auditoria tenant-aware aplicadas no PostgreSQL local;
- CVE critica de `swiper` removida pela atualizacao para `12.2.0`;
- checklist de seguranca em `docs/security/juridico-official-data-sprint-1.md`.

### Sprint 2 — Snapshots E Monitoramento Duravel

**Estado: concluida** (2026-08-28)

Objetivo: acompanhar processos cadastrados voluntariamente e detectar novas
movimentacoes DataJud de modo duravel, tenant-aware e auditavel.

Escopo confirmado:

- opt-in explicito, pausa, retomada e exclusao do acompanhamento por processo;
- cadencia configuravel por acompanhamento, com limite por cliente e default
  conservador definido no gate tecnico;
- snapshot normalizado e historico de movimentacoes no banco juridico dedicado;
- workflow Temporal idempotente por `client_id + processo`;
- worker Temporal chama somente endpoint interno S2S do BFF; nao acessa DataJud
  ou banco juridico diretamente;
- BFF continua owner de tenant, `database_ref`, chamada ao servico DataJud,
  persistencia, diff e auditoria;
- historico e dados processuais necessarios permanecem durante o acompanhamento
  ativo e sao eliminados automaticamente 180 dias apos pausa ou exclusao;
- cliente/escritorio e controlador; JBoot e operadora, sujeito a validacao
  contratual e juridica antes de producao.

Criterios de aceite:

- somente usuario com `juridico:write` cria ou altera acompanhamento; exclusao
  exige `juridico:admin`;
- um processo so possui um acompanhamento ativo por cliente, sem conflito de
  workflows concorrentes;
- cada execucao e idempotente, correlacionada e nunca grava payload bruto;
- novas movimentacoes sao identificadas deterministicamente e apresentadas no
  historico do processo;
- cancelamento interrompe novas consultas; rotina de retencao elimina os dados
  operacionais vencidos e deixa apenas evidencia minima permitida;
- isolamento por `client_id` e `database_ref` e coberto por teste automatizado;
- frontend consome exclusivamente o BFF e apresenta estado, ultima verificacao,
  proxima verificacao e erro operacional sem detalhes sensiveis.

Fora de escopo:

- notificacao externa, email, WhatsApp ou webhook;
- ato juridico, confirmacao de leitura ou protocolo;
- DJe/DJEN autenticado, scraping ou provider comercial;
- LLM, resumo juridico ou calculo de prazo;
- retencao de dossie processual de longo prazo.

Dependencias:

- gate `docs/product/juridico-official-data-sprint-2-gate.md`;
- ADR 010, modelo de dados e contratos HTTP da Sprint 2;
- UI/UX antes de qualquer implementacao frontend;
- Dev Runtime Profile e security checklist antes de merge.

Evidencia:

- migration `052_juridico_data_monitoring.sql` com tabelas tenant-aware para
  monitor, execucao, snapshots, movimentacoes e eventos;
- BFF persiste somente CNJ cifrado, HMAC e dados normalizados; nao persiste
  payload bruto do provider;
- callback interno aceita apenas token S2S `juridico-worker` com audience
  `svc:platform-api`, e cada execucao usa chave de idempotencia;
- workflow Temporal suporta parada e agenda purga automatica apos 180 dias de
  exclusao; pausa interrompe polling sem acionar purga;
- interface de acompanhamentos materializada no Platform;
- checklist de seguranca em `docs/security/juridico-official-data-sprint-2.md`.

### Sprint 3 — Calculo Assistivo De Prazos

**Estado: concluida** (2026-08-28)

Objetivo: oferecer calculo deterministico assistivo, nunca conclusao juridica.

Pre-condicoes:

- catalogo de feriados e suspensoes por tribunal com provenance;
- regra de override e revisao humana;
- testes por calendario/tribunal;
- UX deixa claro que o operador deve confirmar o prazo oficial.

Decisões confirmadas: dias úteis com feriados nacionais; início incluído ou
excluído editável por cálculo; fonte oficial com provenance e fallback manual;
override versionado por `juridico:admin`. Gate:
`docs/product/juridico-official-data-sprint-3-gate.md`.

### Sprint 4 — Migracao Do PJe/DJEN Publico

**Estado: concluida** (2026-08-29)

Decisao humana confirmada: migrar somente a integracao DJEN publica para
`svc-jboot-juridico-data`. O BFF conserva tenant, jobs e persistencia; o worker
nao consulta DJEN nem recebe URL de banco. Provider comercial, DJe autenticado e
MCP continuam fora de escopo.

Gate: `docs/product/juridico-official-data-sprint-4-gate.md`.

Mutacoes com efeito juridico permanecem proibidas por default.

## Debitos E Riscos Conhecidos

O registro operacional, IDs, impacto e gate de resolução estão em
`docs/product/juridico-official-data-pendencias.md`.

- upstream `0.1.0` e pre-alpha e nao fornece contrato de API estavel;
- disponibilidade/rate limit DataJud precisam de medicao real antes de SLA;
- politica de retencao de snapshots pertence a Sprint 2;
- calendario do upstream nao e evidencia suficiente para prazo processual real;
- disponibilidade e SLA DataJud seguem nao avaliados ate medicao de producao;
- vulnerabilidades transitivas Node de severidade alta ou menor permanecem
  registradas no checklist, sem CVE critica aberta.
- a classificacao controlador/operadora e a retencao de 180 dias precisam de
  validacao juridica/contratual antes de `production_ready`; isso nao autoriza
  ampliar a retencao por inferencia.
