# Stack Agent: Platform Event Streaming

## Responsabilidade

Event streaming, event bus e logs duraveis com Kafka, Redpanda ou NATS.

## Stacks

| Stack | Usar quando |
|---|---|
| Kafka | Log de eventos duravel, ecossistema amplo, stream processing |
| Redpanda | Kafka-compatible com operacao simplificada e menor overhead |
| NATS | Mensageria leve, request/reply, eventos com menor overhead operacional |

## Padrões de Uso

### Event-Driven Architecture (Fowler, 2017)
- Eventos nomeados como fatos de dominio no passado: `PedidoConfirmado`, `PagamentoProcessado`.
- Schema versionado com evolucao compativel retroativamente (Avro/Protobuf/JSON Schema com registry).
- Particionamento definido por chave de acesso e ordenacao — nao por volume aleatorio.

### Event Sourcing (Young, 2010)
- Retencao, replay e compactacao documentados no contrato do topico antes de criar o topico.
- DLQ ou estrategia de erro explicita: sem mensagem descartada silenciosamente.
- Consumidores idempotentes: reprocessar o mesmo evento nao produz efeito colateral.

### Competing Consumers Pattern (Microsoft, 2014)
- Consumer group com prefetch e concorrencia calibrados por throughput real, nao por estimativa.
- Consumer lag monitorado como metrica de alerta — nao apenas como log.
- Sem consumidor que bloqueia a particao por I/O sincrono lento: offload para thread pool.

## Segurança Obrigatória

- **TLS + SASL obrigatorios**: Conexoes de producao somente via TLS com autenticacao SASL (SCRAM ou mTLS). Sem broker sem autenticacao.
- **ACL de topicos**: Producer e consumer com permissoes separadas por topico. Sem usuario com acesso `*` em producao.
- **Schema Registry com autenticacao**: Registry de schemas acessivel somente por servicos autorizados.
- **Sem dados sensiveis no payload sem criptografia**: PII em evento criptografado em campo antes de publicar — broker nao e substituto de criptografia de dados.
- **Redes**: Brokers nao expostos publicamente. Acesso somente via rede privada ou VPN.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Eventos como parte central da arquitetura | Apenas uma fila simples com um consumidor |
| Multiplos consumidores independentes do mesmo evento | Baixo volume sem necessidade de replay ou auditoria |
| Replay e auditoria de fatos de dominio importam | Equipe sem maturidade para particionamento, lag e schema evolution |
| Alto volume de integracoes event-driven | |
