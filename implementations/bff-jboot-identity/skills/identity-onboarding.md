# Skill Local: identity-onboarding

## Uso

Aplicar quando a tarefa envolver criacao de cliente, admin do cliente, app contratado, database ref ou seletor de app.

## Fluxo Canonico

1. Criar `client`.
2. Criar ou vincular `identity` admin do cliente.
3. Criar `membership` do admin no cliente.
4. Criar `client_application`.
5. Criar `entitlement` do admin para o app.
6. Resolver `database_ref`:
   - app com database principal compartilhado: vincular database/schema existente;
   - app sem database principal: criar ref dedicada com status `provisioning`.
7. Registrar auditoria.

## Regras

- Um cliente nasce com ao menos um app contratado.
- Login global e login de cliente compartilham endpoint, mas divergem por role/contexto.
- Usuario global admin vai para painel admin.
- Usuario de cliente vai direto ao app se houver um app; caso contrario, vai para selecao de app.
- Database dedicado nao deve ser criado diretamente por request HTTP sincronamente.

