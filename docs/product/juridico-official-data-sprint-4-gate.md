# Sprint 4 Gate — DJEN Publico Interno

## Decisao confirmada

Em 2026-08-29, o usuario aprovou a migracao do DJEN publico para o servico
juridico interno. Limite de responsabilidade: `BFF -> svc-juridico-data ->
DJEN`; o BFF e o unico owner de tenant, job e persistencia.

## Criterios terminais e evidencia

- servico expoe DJEN normalizado, paginado e autenticado por S2S;
- URL do provider e fixa em allowlist, sem SSRF ou payload bruto;
- BFF cria, acompanha, cancela e persiste jobs usando `client_id` e
  `database_ref` do contexto autenticado;
- worker nao possui cliente/rota/credencial DJEN nem URL de banco para PJe;
- testes, lint, type-check, build, auditoria de dependencias e conformance
  aprovados dentro dos containers;
- checklist de seguranca sem itens abertos.

Evidencia: `svc-jboot-juridico-data` aprovou Ruff, mypy, 13 testes e
`pip-audit`; o BFF aprovou lint, type-check, 179 testes e build; o worker
aprovou 12 testes depois da retirada integral do adapter PJe. `pyright` do
worker permanece com 253 erros preexistentes no eProc/stubs asyncpg, fora dos
arquivos DJEN removidos; esse debito nao e usado como evidencia de qualidade da
Sprint 4 e permanece no backlog tecnico do worker.

## Fora de escopo

DJe autenticado, provider comercial, MCP, leitura/protocolo com efeito juridico
e garantias de SLA.
