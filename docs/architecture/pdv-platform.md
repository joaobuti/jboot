# Plataforma PDV

## Status

Arquitetura anterior mantida como origem de migracao. A direcao atual e plataforma modular conforme `docs/architecture/decisions/003-jboot-platform-modular-monolith.md`.

## Objetivo

Criar uma plataforma PDV multi-tenant como modulo de uma platform backend/web, mantendo app offline-first e servico fiscal separados.

## Projetos

| Projeto | Responsabilidade |
|---|---|
| `implementations/bff-jboot-platform/modules/pdv` | API e dominio transacional do PDV dentro da platform backend. |
| `implementations/app-jboot-next-platform/modules/pdv` | Web admin e frente de caixa online dentro da platform Next.js. |
| `implementations/app-jboot-pdv-mobile` | App mobile/tablet offline-first. |
| `implementations/svc-jboot-fiscal` | Emissao fiscal reutilizavel por produtos JBoot. |

## Projetos De Origem Da Sprint 1 (removidos)

`implementations/bff-jboot-pdv` e `implementations/app-jboot-pdv-web` foram a primeira implementacao do PDV e serviram como origem de migracao para a hierarquia acima. Ambos foram removidos do repositorio em 2026-07-17, apos a migracao estar concluida. Referencia historica (contrato, agents, skills) arquivada em `implementations/bff-jboot-platform/modules/pdv/legacy-reference/bff-jboot-pdv/`.

## Fronteiras

```text
Identity Hub
  -> autentica e emite JWT/contexto por modulo contratado

bff-jboot-platform/modules/pdv
  -> valida JWT/contexto
  -> aplica client_id obrigatorio
  -> gerencia produtos, estoque, vendas, caixa e pagamentos

app-jboot-next-platform/modules/pdv
  -> admin + frente de caixa online
  -> renderizado apenas quando o contexto selecionado for application_slug=pdv

app-jboot-pdv-mobile
  -> frente de caixa offline-first
  -> SQLite local
  -> fila local de eventos
  -> sync idempotente

svc-jboot-fiscal
  -> emissao fiscal
  -> integracao por contrato
```

## Sprint 0

- Criar contratos dos projetos.
- Criar agents e skills locais.
- Definir design system compartilhado.
- Definir modelo multi-tenant base.
- Definir contrato com Identity Hub.
- Definir contrato inicial de sync offline.

## Regras Estruturais

- Nao criar autenticacao propria.
- Nao misturar PDV dentro do `bff-jboot-identity`.
- Nao modelar `platform` como permissao de usuario; PDV e cada modulo interno sao products/applications contratadas no Identity.
- O shell Platform deve esconder menus de outros modulos quando a sessao estiver em contexto PDV.
- Todos os dados de negocio usam `client_id`.
- App pode finalizar venda sem internet.
- Sync deve ser idempotente.
- Fiscal e servico separado.
- Web e app compartilham identidade visual por tokens, nao por componentes DOM.
