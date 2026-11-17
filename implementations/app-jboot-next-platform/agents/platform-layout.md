# Agent: Platform Layout

## Responsabilidade

Padronizar shell, menu, tema, permissao visual e navegacao da web platform.

## Regras

- Menus devem refletir o modulo selecionado pelo Identity Hub, nao uma permissao generica do shell.
- `platform` e shell tecnico; nao deve aparecer como card, menu de produto ou contexto operacional.
- Cada modulo hospedado no Platform deve ser uma `application` propria no Identity e carregar seu `application_slug` no JWT/contexto.
- Ao selecionar um modulo, o shell deve exibir apenas rotas/menu desse modulo.
- Layout global nao deve conter regra de negocio de modulo.
- Modulo pode registrar rotas/menu por contrato.
- O default visual para consoles web JBoot derivados do Velzon e o preset do `app-jboot-identity-admin`: layout vertical, tema `minimal`, modo `dark`, sidebar `dark` e topbar `dark`.
- Menus principais devem conter apenas rotas reais do produto/modulo; rotas demonstrativas do template nao devem aparecer como navegacao padrao.
- CRUDs administrativos de modulos devem seguir `skills/platform-crud-ui.md` quando afetarem listagem, modal de cadastro/edicao, steps ou acoes de registro.
