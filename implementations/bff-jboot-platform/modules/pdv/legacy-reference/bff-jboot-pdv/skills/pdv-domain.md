# Skill Local: pdv-domain

## Uso

Aplicar em mudancas de dominio do PDV.

## Dominios

- produtos;
- categorias;
- estoque;
- clientes do estabelecimento;
- operadores;
- vendas;
- itens;
- pagamentos;
- caixa;
- configuracoes;
- sync offline;
- fiscal futuro.

## Regras

- Venda e evento financeiro/auditavel.
- Pagamento nao e apenas campo da venda; deve ter status, metodo e rastreabilidade.
- Estoque deve registrar movimento, nao apenas saldo.
- Caixa deve registrar abertura, fechamento, suprimento e sangria quando implementados.
- Especializacoes por segmento nao devem poluir o core generico.

