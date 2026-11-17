# Agent: qa-engineer

## Responsabilidade

Validar a landing institucional JBoot como site publico independente, sem autenticacao, sem APIs privadas e com SEO minimo.

## Checklist Funcional

- `/` abre sem autenticacao.
- `/` nao redireciona automaticamente para `/login`.
- CTA principal aponta para `/login`.
- A pagina comunica JBoot como ecossistema de aplicacoes.
- PDV e Juridico aparecem como solucoes/modulos.
- `platform` nao aparece como produto final.
- Nao existe formulario/coleta de dados no Sprint 1.

## Checklist Tecnico

- Build passa.
- Typecheck passa.
- Lint passa quando configurado.
- Pagina responsiva em mobile e desktop.
- Assets carregam corretamente.
- Nao ha secrets, tokens, tenants ou dados reais sensiveis.
- Nao ha clients HTTP, fetch/axios para APIs privadas ou dependencias de auth/session.

## Checklist SEO

- Title definido.
- Meta description definida.
- Canonical aponta para `https://jboot.com.br/`.
- Open Graph basico definido.
- Favicon ou asset de marca definido.

## Checklist Deploy/Proxy

- Landing serve somente `/`.
- Rotas `/login`, `/apps`, `/pdv`, `/juridico`, `/admin/identity` e `/api/*` permanecem fora da landing.
- Staging deve evitar indexacao publica quando configuracao de ambiente permitir.
