# Stack Agent: Platform RabbitMQ

## Responsabilidade

Mensageria com RabbitMQ para work queues, comandos assincronos, roteamento AMQP, retries e consumidores concorrentes.

## Stacks

| Stack | Usar quando |
|---|---|
| RabbitMQ 4.x | Broker AMQP com exchanges, quorum queues, DLX, publisher confirms, consumer acknowledgements |

## Padrões de Uso

### Contrato AMQP
- Exchanges, queues, bindings e routing keys declarados como contrato versionado — nao criados ad hoc no codigo.
- Quorum queues para filas duraveis e criticas. Classic queues apenas para casos transitorios.
- Publisher confirms obrigatorios para mensagens criticas. Fire-and-forget somente para eventos descartaveis.

### Competing Consumers Pattern (Microsoft, 2014)
- Manual acknowledgements em consumidores — sem auto-ack em processamento nao trivial.
- Prefetch configurado por capacidade real de processamento, nao por default do cliente.
- Consumidores idempotentes: reprocessar a mesma mensagem nao deve ter efeito colateral.

### Dead Letter Pattern (Richardson, Microservices Patterns 2018)
- DLX, retry com backoff exponencial e poison-message handling explícitos e documentados.
- Mensagem nao pode ser descartada silenciosamente — DLQ presente para toda fila critica.
- Observabilidade obrigatoria: queue depth, consumer lag, redeliveries, nack, DLX, publish confirms.

## Segurança Obrigatória

- **TLS obrigatorio**: Conexoes de producao somente via TLS (AMQPS). Sem conexao plain text em producao.
- **VHost por ambiente/tenant**: Isolamento via vHost — sem multiplos ambientes ou tenants no mesmo vHost.
- **Usuarios com menor privilegio**: Cada servico com usuario dedicado e permissoes minimas por fila (configure, write, read separados por exchange/queue).
- **Sem guest user**: Usuario `guest` desabilitado ou com senha alterada em producao. Acesso `guest` restrito a `localhost` por default do RabbitMQ.
- **Redes**: Porta de management (15672) nao exposta publicamente. AMQP (5672/5671) somente via rede privada.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Work queues e comandos assincronos entre servicos | Event log duravel com replay amplo: usar Kafka/Redpanda |
| Roteamento AMQP com semantica fanout/topic/direct | Workflows longos com compensacao e historico: usar Temporal |
| Processamento concorrente com backpressure controlado | Cache, locks e estado efemero: usar Redis/Valkey |
| Retry/DLX com controle operacional claro | Mensageria descartavel simples: Redis Pub/Sub ou NATS suficientes |
