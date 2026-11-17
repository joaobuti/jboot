# Skill: temporal-worker-pattern

## Objetivo

Padronizar implementação de workers e activities Temporal em Python para o `wrk-jboot-juridico`.

## Procedimento

1. Definir workflow em `src/workflows/` — responsável por orquestrar activities.
2. Definir activities em `src/activities/` — responsável por executar scraping via adapter.
3. Registrar worker em `src/workers/` com namespace e task queue corretos.
4. Contratos de entrada e saída de workflows e activities tipados com dataclasses ou Pydantic.
5. Retry e timeout configurados via `ActivityOptions` — nunca via lógica manual.
6. Erros de negócio (portal indisponível, autenticação falhou) retornados como resultado estruturado, não como exceção Temporal.
7. Erros inesperados propagados como exceção para que Temporal gerencie retry.

## Restrições

- Workflow não executa I/O — delega para activities.
- Activity não chama outra activity diretamente — orquestração é responsabilidade do workflow.
- Task queue separada por tipo de operação se necessário (ex: `juridico-scraping`, `juridico-polling`).
