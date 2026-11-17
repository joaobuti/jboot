# Juridico Official Data Sprint 3 Gate

```yaml
gate_status: completed
architecture_confirmed_by_human: 2026-08-28
functional_code_started: true
blocking_status: no_open_blockers
execution_mode: cross_project
target_projects: [implementations/bff-jboot-platform, implementations/app-jboot-next-platform]
target_module: modules/juridico
delivery_type: deterministic_deadline_calculation
sprint_artifact: docs/product/juridico-official-data-sprints.md
stack_fit_gate: approved
open_questions: []
```

## Terminal Closure Checklist

- [x] API de cálculo, calendário e override atende o contrato e tem testes.
- [x] UI oferece cálculo e administração do catálogo/overrides conforme scopes.
- [x] provenance oficial/manual, versão e motivo de override são visíveis.
- [x] validações BFF e frontend aprovadas dentro do container.
- [x] checklist de segurança, AI context/conformance e evidência atualizados.
- [x] Sprint marcada como concluída somente após os itens anteriores.

## Confirmed scope

- days úteis, descontando apenas sábados, domingos e feriados nacionais;
- início incluído ou excluído é parâmetro explícito por cálculo;
- catálogo com URL/identificador do ato oficial e fallback administrativo;
- override é versionado, exige motivo e `juridico:admin`;
- resultado é assistivo e exige confirmação humana.

NestJS, PostgreSQL e Next existentes são aprovados; novo serviço, worker e
biblioteca jurídica externa são rejeitados por não agregarem fronteira ou
provenance auditável. URLs são metadados allowlisted (`https`, `gov.br` ou
`jus.br`) e nunca destinos de fetch arbitrário.
