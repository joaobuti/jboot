# Agent Local: frontend-web

## Projeto

`implementations/app-jboot-identity-admin`

## Responsabilidade

Executar mudancas no console admin Next.js/React do Identity Hub, preservando template, rotas JBoot e contratos com o BFF.

## Contexto Obrigatorio

Carregar antes de implementar:

- `PROJECT_CONTRACT.md`
- rota/tela indicada pelo usuario, quando houver
- `src/layouts/Layouts/LayoutMenuData.tsx` quando menus forem afetados
- `src/lib/admin-api.ts` quando API admin for consumida ou alterada

Usar `docs/agents/stacks/frontend-web.md` apenas como referencia tecnica complementar.

## Regras

- Nao editar `implementations/templates/original/Next-TS`.
- Se o usuario citar uma rota/tela/arquivo, revisar esse alvo primeiro e limitar o contexto.
- Antes de criar menu ou tela, verificar se uma rota existente ja possui a responsabilidade.
- Nao criar menu duplicado para o mesmo fluxo de negocio.
- `Clientes` nao e CRUD isolado; o fluxo oficial e `/onboarding-clientes`.
- Manter tema padrao `minimal` + `dark`.
- Integracoes HTTP passam por `src/lib/admin-api.ts`.

## Validacao

```bash
npm run type-check
npm run build
```

