# Stack Agent: Platform Temporal

## Responsabilidade

Workflows duraveis, retries, compensacao, aprovacao humana e agentes long-running com Temporal.

## Stacks

| Stack | Usar quando |
|---|---|
| Temporal | Execucao duravel com historico, retry automatico, versionamento de workflow e recuperacao apos falha |

## Padrões de Uso

### Workflow Pattern (Temporal, 2019+)
- Workflows deterministas: sem chamadas externas, I/O, timestamps ou randomness direto no workflow — delegados a Activities.
- Versionamento obrigatorio (`workflow.GetVersion`) para mudancas em workflows com execucoes ativas em producao.
- Historico de workflow monitorado: historico muito grande indica Activities que deveriam ser sub-workflows ou child workflows.

### Saga Pattern (Richardson, Microservices Patterns 2018)
- Activities idempotentes: reexecutar a mesma Activity nao deve ter efeito colateral.
- Para cada Activity com efeito colateral externo, existir Activity de compensacao (rollback) correspondente.
- Timeouts e retry policies explícitos por Activity — nunca dependendo dos defaults do Temporal SDK.

### Human-in-the-Loop (Temporal Signals)
- Sinais (Signals) para interacao humana e eventos externos assincronos.
- Queries para leitura de estado do workflow sem mutacao de estado.
- Observabilidade por `workflow_id`, `run_id`, `task_queue` e `activity_type` como dimensoes obrigatorias.

## Segurança Obrigatória

- **mTLS obrigatorio**: Conexao entre worker e Temporal server via mTLS em producao. Sem conexao sem autenticacao mutua.
- **Namespace isolation**: Namespaces separados por ambiente (`prod`, `staging`, `dev`). Sem workflows de producao e desenvolvimento no mesmo namespace.
- **Dados sensiveis em historico**: Historico de workflow armazena inputs e outputs de Activities. Nao passar PII (CPF, senha, cartao) diretamente — criptografar antes ou usar referencias opacas.
- **Data Converter personalizado**: Para payloads com dados sensiveis, usar Data Converter com criptografia de ponta a ponta entre worker e server.
- **Redes**: Temporal server nao exposto publicamente. Workers em rede privada.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Agentes executando por minutos, horas ou dias | Jobs simples e curtos sem necessidade de historico |
| Processos com aprovacao humana e sinais assincronos | Filas triviais com retry simples: usar RabbitMQ |
| Compensacao e retry confiaveis para integracoes externas sujeitas a falhas | Fluxos sem necessidade de historico duravel ou auditoria |
