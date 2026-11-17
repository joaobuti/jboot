# Skill: next-module-pattern

## Objetivo

Padronizar modulos web dentro da Next platform.

## Procedimento

1. Confirmar `target_module`.
2. Confirmar que o modulo existe como `application` propria no Identity, com `client_application`, `entitlement`, roles, scopes, `database_ref` e `launchUrl`.
3. Criar rotas e componentes dentro do modulo.
4. Registrar menu/rota no shell apenas por contrato e filtrar pelo `application_slug` selecionado.
5. Centralizar client HTTP do BFF proprio do modulo.
6. Validar type-check e build.
