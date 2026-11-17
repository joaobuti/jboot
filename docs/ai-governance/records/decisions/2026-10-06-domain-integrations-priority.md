# Decision: Domain Integrations Como Fronteira Prioritaria Cross-Domain

date: 2026-10-06
status: approved_by_human
agents: product-owner, product-engineer, architect, ai-graph-architect, domain-integrations
skills: ai-first-governance, security-checklist, domain-flow-import, tenant-context, api-contract
decision_owner: human
execution_authorized: true

## Context

`domain-integrations` evoluiu de Juridico -> Flow para exportacao DataJud,
monitoramento de processo e propagacao de eventos. O contrato permaneceu
centrado na primeira entrega, enquanto o service acumulou contextos de dois
produtos, transformacao, auditoria e notificacao.

O guard atual aplica `juridico:read` uniformemente e os use cases reutilizam o
`database_ref` do token chamador. Em uma operacao iniciada no Flow, esse valor
nao representa necessariamente o banco do Juridico. UUID de card tambem nao e
substituto para autorizacao de board.

## Decision

1. `domain-integrations` e prioridade ativa ate conclusao ou ordem humana em
   contrario.
2. O modulo permanece embutido no `bff-jboot-platform` e herda sua stack.
3. Contextos de origem/destino sao resolvidos server-side por identidade,
   cliente e application slug.
4. Autenticacao do chamador e autorizacao cross-domain sao responsabilidades
   distintas; cada use case valida scopes, entitlement e acesso ao recurso.
5. Cada fluxo concreto possui adapter/use case proprio. O modulo coordena, mas
   nao se torna dono das regras dos dominios.
6. Contratos HTTP existentes permanecem compativeis durante o hardening.
7. Falhas entre bancos usam idempotencia, recuperacao e evidencia operacional;
   nao se promete transacao distribuida ou exactly-once.
8. Novos adapters de produto aguardam o fechamento do hardening.

## Rejected

- microservico agora: custo operacional sem requisito de escala/SLA isolado;
- confiar no `database_ref` do chamador para ambos os dominios: viola fronteira
  de dados e falha quando a operacao nasce no destino;
- service/registry generico de ESB: centralizacao sem necessidade demonstrada;
- UUID como controle de acesso: identificador nao prova membership ou role;
- importar integralmente o checkout historico sujo: mistura features e elimina
  rastreabilidade.

## Trust Boundaries

- JWT fornece identidade e cliente do chamador, nunca autoridade global;
- Identity resolve entitlements e database refs dos produtos envolvidos;
- Juridico e Flow preservam ownership de dados e regras;
- payload nao aceita tenant, application ou database reference;
- logs, graph e attestations nao armazenam PII, token ou numero CNJ em claro.

## Validation

- testes negativos de tenant, entitlement, scopes e board membership;
- retries e falhas parciais exercitados deterministicamente;
- security checklist, API Graph e Architecture Graph;
- testes/type-check/lint/build no container;
- AI conformance, attestation e evidence pack.

## Follow Up

Executar `docs/product/domain-integrations-hardening-sprints.md` e manter o gate
terminal em `docs/product/domain-integrations-hardening-sprint-1-gate.md`.

