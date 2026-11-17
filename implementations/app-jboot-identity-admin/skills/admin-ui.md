# Skill Local: admin-ui

## Uso

Aplicar ao criar ou alterar telas, menus e fluxos do console admin.

## Padrao

- Usar componentes e padroes existentes do template copiado.
- Preferir telas densas, operacionais e auditaveis.
- Evitar landing page ou textos explicativos dentro da aplicacao.
- Listagens admin devem expor estado, acoes e feedback de erro.
- Formularios devem validar campos obrigatorios antes de enviar.
- Fluxos de negocio principais nao devem ser divididos em CRUDs redundantes.

## Regras De Menu

- Menus JBoot ficam no mesmo nivel de `Dashboard`.
- Criar novo menu somente quando houver responsabilidade distinta.
- Se um menu existente ja representa o fluxo, consolidar nele.

