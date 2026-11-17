# Skill: datajud-contract

## Objetivo

Adaptar o DataJud para contratos JBoot estaveis sem vazar Elasticsearch,
FastMCP ou payload bruto para o BFF.

## Procedimento

1. Validar e normalizar numero CNJ.
2. Resolver tribunal/indice apenas pelo catalogo allowlisted.
3. Construir query DataJud internamente com size limitado.
4. Executar via gateway com timeout/retry/rate limit.
5. Rejeitar `nivelSigilo > 0` antes de cache/log/retorno.
6. Converter para schemas de dominio com limites de colecao.
7. Mapear not found, restricted, invalid, rate limited, timeout e unavailable
   para problem details estaveis.
8. Incluir `source`, `capturedAt`, `requestId` e ultima atualizacao quando
   fornecida pela fonte.

## Restricoes

- sem URL/indice arbitrario em input;
- sem busca ampla por todos os tribunais sem budget e limite explicitos;
- sem persistencia ou cache de resposta na Sprint 1;
- sem fallback silencioso para provider comercial;
- sem timestamp fabricado para dado ausente;
- sem campo de contrato que nunca apareceu em resposta real do DataJud: o
  indice nao tem `partes`, mesmo que parecesse natural modela-lo;
- fixture sai de resposta real capturada, anonimizada, com origem anotada
  (indice, numero CNJ consultado, data da captura); fixture escrita a mao
  valida a suposicao do agente, nao a fonte.

## Formatos Observados Na Fonte

- datas em ISO-8601 (`dataHoraUltimaAtualizacao`, `movimentos[].dataHora`) e
  compacto `yyyyMMddHHmmss` (`dataAjuizamento`) no mesmo documento;
- indices eleitorais com hifen (`api_publica_tre-ac`); STF nao publica na API
  Publica;
- orgao julgador do movimento como `codigoOrgao`/`nomeOrgao` ou
  `codigo`/`nome`.

## Testes Minimos

- numero formatado e somente digitos;
- digito verificador invalido;
- tribunal fora da allowlist;
- processo encontrado, inexistente e sigiloso;
- schema parcial/malformado;
- timeout, retry esgotado e 429 com `Retry-After`.
