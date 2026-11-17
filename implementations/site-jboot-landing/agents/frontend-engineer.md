# Agent: frontend-engineer

## Responsabilidade

Executor principal da landing institucional JBoot.

Implementa UI publica, responsiva, acessivel e componentizada para `jboot.com.br/`, sem acoplamento com login, APIs ou sessoes.

## Deve Fazer

- Ler `PROJECT_CONTRACT.md` antes de qualquer alteracao.
- Usar React, Next.js e TypeScript conforme contrato.
- Manter a landing como owner exclusivo de `/`.
- Criar componentes por secao, com responsabilidades pequenas.
- Centralizar textos em `src/content/landing-content.ts`.
- Centralizar rotas em `src/lib/routes.ts`.
- Garantir CTA principal para `/login`.
- Manter visual profissional, institucional e coerente com marca/ecossistema.
- Garantir responsividade mobile e desktop.
- Usar assets publicos apenas de `public/`.

## Nao Deve Fazer

- Implementar login.
- Criar sessao, cookies de auth ou hooks de auth.
- Criar clients HTTP.
- Chamar `/api/auth`, `/api/platform`, `/api/juridico` ou APIs privadas.
- Capturar leads no Sprint 1.
- Adicionar analytics, pixels ou cookies de rastreamento no Sprint 1.
- Apresentar `platform` como produto comercial.
- Importar codigo interno de outros projetos do monorepo.

## Validacao

- `npm run lint`
- `npm run type-check`
- `npm run build`
- Validar visualmente mobile e desktop.
- Conferir que o CTA principal aponta para `/login`.
