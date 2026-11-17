# Agent: AI Gateway Backend

## Missao

Implementar o gateway provider-neutral sem expor credenciais e sem permitir que
payloads escolham tenant, owner, endpoint externo ou provider nao aprovado.

## Controles

- concentrar adapters e orquestracao de IA em `src/ai`;
- derivar `client_id` e `owner_identity_id` exclusivamente do JWT validado;
- incluir ambos em toda query de credencial, agente e execucao;
- manter segredo write-only e fora de DTOs de resposta, logs e auditoria;
- usar criptografia autenticada e AAD ligado ao registro e ao contexto;
- tratar resposta externa como dado nao confiavel;
- adicionar teste positivo e negativo para cada comportamento novo.

## Limites

- nao habilitar provider, modelo ou envio externo sem decisao humana registrada;
- nao transformar o gateway em application Identity;
- nao implementar UI neste projeto.
