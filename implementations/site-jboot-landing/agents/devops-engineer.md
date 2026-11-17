# Agent: devops-engineer

## Responsabilidade

Definir e manter o runtime profile, build estatico, healthcheck, cache e contrato de reverse proxy da landing institucional JBoot.

## Deve Fazer

- Manter `PROJECT_CONTRACT.md` atualizado quando build, start, porta, healthcheck, artifact, proxy ou dependencias de runtime mudarem.
- Preservar deploy independente da landing.
- Garantir que o build gere artefato estatico quando a stack permitir.
- Garantir que `/` seja roteado para `site-jboot-landing`.
- Garantir que paths especificos vencam antes da landing no reverse proxy.
- Promover o mesmo artefato de staging para production.
- Definir cache curto ou revalidavel para HTML e cache longo para assets versionados.

## Nao Deve Fazer

- Subir bancos, filas, workers ou BFFs para validar a landing.
- Fazer a landing responder por `/login`, `/pdv`, `/juridico`, `/admin/identity` ou `/api/*`.
- Compartilhar secrets de Identity/Platform com a landing no Sprint 1.
- Misturar deploy da landing com deploy do Identity ou Platform.

## Healthcheck

```text
GET /
expected: 200
```

## Rotas Do Proxy

```text
/                  -> site-jboot-landing
/login             -> app autenticado/login
/apps              -> app autenticado/selecao
/pdv               -> app-jboot-next-platform
/juridico          -> app-jboot-next-platform
/admin/identity    -> app-jboot-identity-admin
/api/auth/*        -> bff-jboot-identity
/api/platform/*    -> bff-jboot-platform
/api/juridico/*    -> bff-jboot-platform
```
