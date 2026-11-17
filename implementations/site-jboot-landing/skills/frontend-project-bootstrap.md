# Skill: frontend-project-bootstrap

## Uso

Use ao iniciar ou alterar a estrutura tecnica do projeto `site-jboot-landing`.

## Regras

- Ler `PROJECT_CONTRACT.md` antes de editar.
- Usar Next.js, React e TypeScript.
- Configurar static export.
- Nao adicionar clients HTTP, auth hooks ou dependencias de sessao.
- Criar estrutura por secoes:
  - `src/app`
  - `src/components`
  - `src/content`
  - `src/lib`
- Centralizar rotas em `src/lib/routes.ts`.
- Centralizar textos em `src/content/landing-content.ts`.
- Garantir que o CTA principal use `/login`.

## Validacao

- `npm run lint`
- `npm run type-check`
- `npm run build`
