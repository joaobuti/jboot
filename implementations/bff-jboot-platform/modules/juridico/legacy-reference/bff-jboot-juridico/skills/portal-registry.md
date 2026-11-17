# Skill: portal-registry

## Objetivo

Criar e manter o registry de portais jurídicos disponíveis na plataforma e seus contratos de acesso por tenant.

## Procedimento

1. Declarar `target_project: implementations/bff-jboot-juridico`.
2. Definir portal no registry: `portal_id`, nome, tipo de autenticação (none, user_pass, token, 2fa), estado (active/inactive).
3. Definir contrato de tenant: quais `portal_id` o `client_id` tem acesso.
4. Expor via API apenas portais contratados pelo tenant autenticado.
5. Validar `client_id` + `portal_id` antes de qualquer operação de scraping.

## Restrições

- Tenant não pode acessar portal não contratado — validar em service, não apenas em UI.
- Novos portais são registrados no registry sem alterar contratos de outros tenants.
