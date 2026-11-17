# Juridico Official Data Sprint 2 Gate

## Status

```yaml
gate_status: completed
architecture_confirmed_by_human: 2026-08-27
functional_code_started: true
blocking_status: no_open_blockers_for_development
```

## PE Decision

```yaml
execution_mode: cross_project
delivery_type: durable_monitoring_integration
target_projects:
  - implementations/bff-jboot-platform
  - implementations/wrk-jboot-juridico
  - implementations/svc-jboot-juridico-data
  - implementations/app-jboot-next-platform
target_module: modules/juridico
sprint_artifact: docs/product/juridico-official-data-sprints.md
sprint_gate: docs/product/juridico-official-data-sprint-2-gate.md
stack_fit_gate: approved
open_questions: []
blocking_status: unblocked_for_foundation_artifacts
```

## Decisoes Humanas Confirmadas

- cadencia configuravel por acompanhamento;
- worker Temporal chama endpoint interno do BFF por JWT S2S proprio;
- BFF permanece owner de banco, tenant, consulta DataJud, snapshots e diff;
- retencao: 180 dias apos pausa ou exclusao;
- cliente/escritorio: controlador; JBoot: operadora; validar juridico/contrato
  antes de `production_ready`.

## Stack Fit Gate

Temporal no worker existente foi escolhido para scheduling duravel. Cron no BFF,
novo servico e acesso direto do worker a banco/DataJud foram rejeitados no ADR
010 por menor resiliencia ou quebra de fronteiras.

## Contratos Obrigatorios Antes De Codigo

- `docs/architecture/decisions/010-juridico-data-monitoring.md`;
- `docs/data/juridico-data-sprint-2-data-model.md`;
- contratos HTTP BFF de produto e Worker -> BFF interno;
- atualizacao dos contratos dos quatro projetos afetados;
- UX da rota de acompanhamentos;
- Dev Runtime Profile com Temporal opt-in no target Juridico.

## Stop Conditions

- ausencia de chave/versionamento de cifra para CNJ monitorado;
- worker com acesso direto ao banco, DataJud ou JWT de usuario;
- ausencia de rotina testada de purga/retencao;
- endpoint interno sem autenticacao S2S, audience/caller restritos e idempotencia;
- query sem `client_id`, dados sensiveis em logs ou snapshot/payload bruto;
- qualquer notificacao externa incluida sem gate proprio.

## Evidencia de Conclusao

- BFF: monitor opt-in, pausa, retomada, exclusao, snapshots, diff deterministico,
  idempotencia e purga protegida por JWT S2S do worker;
- Worker: workflow Temporal por monitor, sinal de parada e acionamento da purga
  apos 180 dias para exclusoes;
- UI: listagem, cadastro, pausa/retomada e exclusao pela rota
  `/juridico/acompanhamentos`;
- validacoes executadas no container: testes BFF, build BFF, Pyright dos
  componentes do worker, type-check e build frontend.
