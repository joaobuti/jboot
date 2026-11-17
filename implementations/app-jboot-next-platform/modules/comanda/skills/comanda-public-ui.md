# Skill: comanda-public-ui

## Objetivo

Padronizar as telas publicas do autoatendimento: identificacao por telefone/CPF, cardapio, carrinho, acompanhamento de pedido e solicitacao de fechamento.

## Entradas

- Token do QR de mesa (via path/query da rota `/comanda/:tableToken`).
- Resposta de `GET /catalog/public/menu/:clientId` (categorias + produtos + secao "Outros").
- Resposta de `GET /comanda/public/me` (itens por pedido, status, total).

## Saidas

- Formulario de telefone/CPF (so quando nao ha sessao ativa).
- Cardapio agrupado por categoria, com secao "Outros" ao final.
- Carrinho local antes do envio; apos envio, itens somem do carrinho e aparecem no acompanhamento com status.
- Acompanhamento com status por item (`pendente`, `em_producao`, `pronto`, `liberado_para_entrega`, `cancelado`) em linguagem simples para o cliente final.
- Botao de "Solicitar fechamento", com confirmacao visual de que a solicitacao foi enviada (nao que a conta ja foi fechada).

## Falhas Esperadas

- Sessao expirada durante o uso (JWT `exp` estourado): redirecionar para o formulario de telefone/CPF, preservando o `tableToken`.
- Backend retorna comanda `fechada` (fechamento processado por outra aba/dispositivo): bloquear novo pedido, mostrar mensagem de comanda encerrada.
- Cardapio vazio (tenant sem a capability `comanda` habilitada em `client_capabilities`, ou sem produto visivel): mostrar estado vazio, nunca erro tecnico.
