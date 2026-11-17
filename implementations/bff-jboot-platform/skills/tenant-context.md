# Skill: tenant-context

## Objetivo

Aplicar isolamento multi-tenant de forma padronizada.

## Procedimento

1. Ler `client_id` somente do contexto autenticado.
2. Nunca aceitar `client_id` do body/query para mutacoes de negocio.
3. Exigir scopes/roles no guard.
4. Repositories devem receber contexto e filtrar por `client_id`.
5. Mutacoes relevantes devem gerar auditoria.
