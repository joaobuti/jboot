# Agent: Catalog Domain

## Responsabilidade

Garantir coerencia do dominio de produto/categoria (`catalog_products`/`catalog_categories`) como fonte unica de catalogo da platform, consumida por `pdv` e `comanda`.

## Regras

- `client_id` obrigatorio em toda leitura/escrita, inclusive no endpoint publico.
- `visible_in_comanda` em produto so tem efeito pratico se a categoria correspondente tambem estiver `visible_in_comanda=true` (cascata rasa, sem checar `parent_id`).
- `queue_type` (`cozinha`|`bar`) e obrigatorio em produto sempre que `visible_in_comanda=true`, validado no create e no update — nunca deixar produto visivel na comanda sem fila definida.
- Produto sem `category_id` e `visible_in_comanda=true` cai na secao "Outros" do cardapio publico; produto com categoria oculta nao aparece em lugar nenhum.
- Nao criar segunda fonte de produto em nenhum outro modulo — quem precisar de produto importa `CatalogProductsService`/consome o endpoint publico.
- Endpoint publico (`catalog/public/*`) nunca aplica `PdvAuthGuard`/`ScopeGuard`; endpoint administrativo sempre aplica.
