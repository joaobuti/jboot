# Stack Agent: Platform Redis/Valkey

## Responsabilidade

Cache, rate limit, locks, estado efemero, filas leves e streams com Redis ou Valkey.

## Stacks

| Stack | Usar quando |
|---|---|
| Redis / Valkey | Cache, estruturas em memoria, TTL, rate limit, locks distribuidos, streams leves |

## Padrões de Uso

### Cache-Aside Pattern (Microsoft, Azure Architecture Center)
- TTL explicito para todo dado efemero — sem chave sem expiracao.
- Chaves namespaced por ambiente, tenant e dominio: `<env>:<tenant>:<dominio>:<id>`.
- Hit ratio, memoria, evictions e latencia monitorados como metricas de alerta — nao apenas como log.

### Rate Limiting e Distributed Lock
- Rate limiting via sliding window counter ou token bucket — algoritmo documentado no contrato.
- Locks com expiracao (TTL de seguranca) e token de propriedade para evitar liberacao por outro processo.
- Pub/Sub somente para eventos descartaveis: mensagem perdida se consumidor estiver offline.

### Redis Streams (Filas Leves)
- Usar apenas quando Kafka/RabbitMQ/Temporal forem excesso para o volume e criticidade do caso de uso.
- Consumer group com ACK explicito — sem consumo sem confirmacao.
- Retencao limitada: Redis nao e substituto de log duravel ou event store.

## Segurança Obrigatória

- **AUTH obrigatorio**: Redis/Valkey sem autenticacao e bloqueante em qualquer ambiente com rede acessivel. Senha forte via `requirepass` ou ACL.
- **ACL por usuario**: Cada aplicacao com usuario dedicado e permissoes minimas (`NOCOMMANDS` + comandos especificos + `~<keyspace-pattern>`). Sem usuario `default` em producao.
- **TLS**: Conexoes de producao somente via TLS. Sem conexao plain text com dados sensiveis.
- **Redes**: Porta Redis/Valkey nao exposta publicamente. Acesso somente via rede privada ou VPN.
- **Dados sensiveis em cache**: Tokens e PII em cache com TTL curto. Sem armazenar senha ou segredo como valor de cache.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Cache e deduplicacao | Mensageria duravel critica via Pub/Sub |
| Rate limiting e quotas | Fonte primaria de verdade para dados transacionais |
| Locks distribuidos simples | Workflows longos com replay, compensacao e auditoria forte |
| Estado efemero de sessoes, tarefas ou agentes | |
| Streams leves quando Kafka/Temporal forem excesso | |
