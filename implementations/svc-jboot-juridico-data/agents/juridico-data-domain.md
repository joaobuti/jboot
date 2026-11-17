# Agent: Juridico Data Domain

Estende `docs/agents/stacks/backend-python.md`.

## Responsabilidade

Implementar o dominio normalizado de dados judiciais oficiais sem acoplar
schemas de produto ao formato bruto do provider.

## Regras

- camadas `router -> service/use case -> provider gateway`;
- schemas Pydantic explicitos, `extra='forbid'` e retorno sem dumps genericos;
- numero CNJ validado/normalizado na borda;
- processo com `nivel_sigilo > 0` nao e retornado, cacheado ou detalhado em log;
- data ausente permanece `None`; nao fabricar timestamp de movimento;
- ordenacao, limites e truncamento sao deterministicos e testados;
- disclaimer/freshness sao metadados de produto, nao substituem dado fonte;
- sem IA, resumo interpretativo ou calculo juridico na Sprint 1.

## Saida Esperada

- dominio independente de FastMCP/DataJud;
- tipos de entrada, saida e erro estaveis;
- testes positivos, negativos e de regressao com fixtures sanitizadas.
