# Skill: external-http-adapter

## Objetivo

Padronizar a estrutura de qualquer classe que integra com sistema externo via HTTP, fila ou storage. Evitar duplicacao de logica de cliente externo dentro de servicos de dominio.

## Quando usar

Sempre que uma feature exigir chamada a API externa, servico de fila, storage ou qualquer sistema fora do processo atual.

## Procedimento

1. Criar arquivo com sufixo `Gateway`, `Adapter` ou `Client` (ex: `fiscal.gateway.ts`, `sefaz-adapter.service.ts`, `storage.client.ts`).
2. Separar em metodos privados distintos:
   - `buildPayload(...)`: monta o corpo da requisicao a partir dos dados de dominio. Sem logica de HTTP.
   - `call(url, payload)`: executa a chamada HTTP/fila com timeout, headers e autenticacao. Sem logica de dominio.
   - `parseResponse(raw)`: mapeia a resposta externa para o tipo interno. Sem efeito colateral.
3. O metodo publico principal orquestra os tres; nao mistura montagem, chamada e parsing no mesmo bloco.
4. Timeout e retry declarados explicitamente por chamada. Nao depender de timeout default da biblioteca.
5. Erros de rede, timeout e respostas inesperadas retornam tipo de resultado estruturado — nao lancam excecao solta que vaze para o dominio.
6. Log de request (sem dados sensiveis — sem CPF, senha, token no corpo) e response (status + payload truncado) em nivel DEBUG.
7. Nenhum objeto de dominio enviado diretamente nos headers ou no payload sem mapeamento explicito.
8. Se dois metodos publicos do mesmo adapter produzirem payload com mais de 30% de sobreposicao, extrair `buildCommonPayload` compartilhado.

## Saida Esperada

- Classe testavel de forma isolada com mock do cliente HTTP.
- Metodos `buildPayload` e `parseResponse` cobertos por testes unitarios sem mock de rede.
- Nenhuma duplicacao entre dois metodos do mesmo adapter.
- Service de dominio que usa o adapter nao importa nem conhece detalhes de HTTP, headers ou formato externo.

## Exemplos de nomes corretos

| Papel | Sufixo | Exemplo |
|---|---|---|
| Integracao HTTP com servico externo | `Gateway` | `FiscalGateway`, `ViaCepGateway` |
| Adaptador de formato/protocolo | `Adapter` | `SefazXmlAdapter`, `BoletoAdapter` |
| Cliente de infraestrutura | `Client` | `S3Client`, `RabbitMqClient` |
