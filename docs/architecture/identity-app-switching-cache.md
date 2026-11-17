# Identity app switching cache

## Objetivo

Permitir que o usuario autenticado navegue entre apps/modulos habilitados sem depender de mocks no Platform, sem confiar no frontend para autorizacao e sem consultar Postgres em toda abertura do header.

## Decisao

O Identity continua sendo a fonte de verdade para clientes, applications, client_applications, entitlements, roles, scopes, contratos e launchUrl.

Redis e usado apenas como cache derivado da lista resolvida de destinos do usuario. O cache nunca concede acesso sozinho: todo miss ou versao defasada e recomposto a partir do Postgres.

## Componentes

- `identity_permission_versions`: tabela Postgres com versao de politica por identity.
- `IdentityApplicationsCacheService`: resolve destinations por identity usando `identity_permission_versions` + Redis.
- `RedisCacheService`: client Redis minimo para GET, SETEX, DEL e SCAN.
- `GET /auth/me/applications`: lista os apps habilitados do usuario autenticado por Bearer token.
- `POST /auth/me/context`: troca o contexto para outro app permitido, emite novo JWT e audita o evento.
- Platform `WebAppsDropdown`: consome `GET /auth/me/applications`, exibe apps reais e chama `POST /auth/me/context` antes de redirecionar.

## Chaves Redis

```txt
identity:applications:{identityId}:v{permissionsVersion}
```

O valor contem:

```json
{
  "identityId": "...",
  "permissionsVersion": 1,
  "destinations": [],
  "cachedAt": "..."
}
```

TTL default: `JBOOT_IDENTITY_APPLICATIONS_CACHE_TTL_SECONDS`, fallback 300 segundos.

## Invalidation

As mutacoes administrativas que alteram permissao ou destino publicam invalidacao operacional:

- entitlement criado/atualizado: incrementa versao da identity afetada e remove cache dessa identity.
- client_application criado/atualizado: incrementa versao das identities do client e limpa cache de applications.
- application atualizada/desabilitada: incrementa versao das identities ligadas a application e limpa cache de applications.

Mesmo se Redis for reiniciado, a versao persistida em Postgres garante que o proximo cache seja reconstruido com a politica atual.

## Seguranca

- Frontend nao decide permissao.
- Troca de app exige Bearer token atual.
- Identity revalida `identityId + clientId + applicationId` contra destinations resolvidos.
- Cada troca emite novo contexto/JWT para o app alvo.
- Modulos/BFFs proprios continuam validando audience, scopes e roles do app selecionado.
- Eventos auditados: `context_switched`, `context_switch_denied`, alem dos eventos existentes de login/contexto.

## Tradeoff aceito

A invalidacao de client/application limpa um conjunto amplo de chaves Redis (`identity:applications:*`) depois de incrementar as versoes das identities afetadas. Isso e deliberado para evitar cache residual em fase inicial. A versao no Postgres preserva corretude; uma otimizacao futura pode manter indice Redis por client/application para apagar somente chaves relacionadas.
