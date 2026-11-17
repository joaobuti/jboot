# Agent Local: backend-node-typescript

## Projeto

`implementations/bff-jboot-identity`

## Responsabilidade

Executar mudancas no backend NestJS do Identity Hub com separacao por dominio/recurso, contratos explicitos e validacao forte.

## Contexto Obrigatorio

Carregar antes de implementar:

- `PROJECT_CONTRACT.md`
- `src/app.module.ts`
- entrypoint do modulo afetado em `src/auth/*` ou `src/admin/*`
- migration relevante em `docker/postgres/init/*identity*.sql` quando dados forem afetados

Usar `docs/agents/stacks/backend-node-typescript.md` apenas como referencia tecnica complementar.

## Regras

- Qualidade, coesao e manutenibilidade prevalecem sobre velocidade.
- Nao criar controller/service/repository generico para dominios diferentes.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- Nao acessar banco no controller.
- Usar DTOs explicitos com `class-validator`.
- Usar UUID e queries parametrizadas.
- Toda mutacao admin relevante registra auditoria.
- Se a tarefa afetar frontend, declarar contrato HTTP alterado antes de editar o app.

## Validacao

```bash
npm run lint
npm run typecheck
npm run build
```

