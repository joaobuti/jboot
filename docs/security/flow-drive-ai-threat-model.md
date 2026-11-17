# Threat Model — Flow, Google Drive E Fronteira De IA

```yaml
date: 2026-10-14
status: active
scope: flow customers, canonical documents, Google Drive replica and reserved legal-ai boundary
data_classification: sensitive
source_decision: docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md
```

## Ativos E Fronteiras

| Ativo/fronteira | Classificacao | Autoridade |
|---|---|---|
| cadastro mestre e vinculos de escritorio | dados pessoais | `establishment-customers`; Flow consome somente services exportados |
| documento e metadados canonicos | sensivel | PostgreSQL + MinIO/S3 do CRM |
| replica Google Drive | sensivel, nao canonica | adapter outbound do Flow, configuracao por tenant |
| referencia OAuth | segredo indireto | runtime/secret store; banco guarda somente `env:*` |
| BullMQ/Valkey | controle operacional | somente `databaseRef`, `clientId` e `syncId` |
| provider de IA | nao autorizado | nenhum adapter ate provider, politica e eval aprovados |

O navegador nunca recebe credencial, token Google, `databaseRef` arbitrario ou
conteudo da fila. Google Drive nao escreve no CRM e nao decide autorizacao,
workflow, aprovacao ou retencao canonica.

## Ameacas E Controles

| Ameaca | Impacto | Controle implementado |
|---|---|---|
| acesso cross-tenant/escritorio | vazamento de cliente/documento | contexto JWT, `client_id` em toda query, policy de escritorio e 404 indistinto |
| SSRF por pasta/URL | acesso a rede interna | hosts Google fixos; input aceita somente identificadores codificados |
| exposicao/rotacao indevida de OAuth | comprometimento da conta Drive | referencia write-only; segredo somente em env; GET/log/auditoria/fila omitem o valor |
| duplicacao por retry ou queda entre upload/commit | copias divergentes | outbox unica por documento+versao+checksum, lease e `jbootSyncId` remoto |
| adulteracao do objeto canonico | replica de conteudo inesperado | SHA-256 relido e verificado antes de todo upload |
| perda/adulteracao da replica | falsa expectativa de backup | CRM permanece canonico; reconciliacao remota de existencia/checksum reabre a outbox |
| indisponibilidade ou rate limit Google | bloqueio do CRM | retry/backoff persistido, DLQ, reprocessamento e falha externa desacoplada do documento canonico |
| PII em observabilidade | vazamento lateral | logs e metricas usam IDs, contagens e codigos sanitizados; DLQ nao retorna conteudo |
| exclusao remota prematura | destruicao durante legal hold | nenhuma exclusao remota sem workflow canonico de expurgo aprovado e auditado |
| prompt injection documental | execucao/decisao indevida | fronteira de IA bloqueada; conteudo sera dado nao confiavel e output nunca aprova/entrega/protocola |

## Riscos Residuais E Gates

- O smoke do contrato Google exige conta controlada e dados sinteticos; nao usar
  conta ou documento real de cliente como fixture.
- `paused` e `deleted`, espelhamento de exclusao e legal hold dependem de um
  workflow canonico de expurgo ainda inexistente. `card.status = deleted` nao e
  autorizacao de exclusao fisica.
- O provider de IA, regiao, retencao, uso para treinamento, base legal,
  consentimento, dataset anonimizado e metas de acuracia permanecem bloqueantes.
- O Architecture Graph transversal ainda aguarda registry/gate. A divida de
  migracao continua registrada e nao equivale a grafo sincronizado.

## Evidencia De Verificacao

- testes de tenant/escritorio/scope e allowlist estatica de SQL;
- testes de segredo write-only, URLs fixas e erros sanitizados;
- testes de checksum canonico, replay remoto, retry/DLQ, reconciliacao e fila
  somente com identificadores;
- `make ai-api-graph-gate`, `make ai-conformance` e evidence pack.
