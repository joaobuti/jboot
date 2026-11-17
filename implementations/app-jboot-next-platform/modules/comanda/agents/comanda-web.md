# Agent: Comanda Web

## Responsabilidade

Garantir que o front publico do autoatendimento (cardapio, carrinho, acompanhamento, fechamento) funcione sem login, sem shell administrativo, mobile-first.

## Regras

- Toda chamada de API usa o token de sessao proprio do `comanda` (cookie/local storage dedicado), nunca o cookie/token do Identity Hub.
- Preco, nome de produto e disponibilidade sempre vem do backend (`catalog`/`comanda`) — nunca calculado ou validado so no cliente.
- Sem redirecionamento para `/login` ou qualquer rota do Identity Hub em nenhum fluxo deste modulo.
- Fechamento de comanda no front so envia a solicitacao (`POST /comanda/public/fechamento`) — nunca simula "comanda fechada" no estado local antes da confirmacao do backend.
