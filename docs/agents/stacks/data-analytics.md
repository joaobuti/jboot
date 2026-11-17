# Stack Agent: Data Analytics

## Responsabilidade

Analytics, telemetria, avaliacao de agentes e exploracao analitica com ClickHouse ou DuckDB.

## Stacks

| Stack | Usar quando |
|---|---|
| ClickHouse | Analytics em escala, observabilidade OLAP, consultas colunares de alto volume |
| DuckDB | Exploracao local, pipelines pequenos, arquivos Parquet/CSV, analise embarcada |

## Padrões de Uso

### Separação OLAP/OLTP
- Analytics nunca compartilha banco com OLTP. Ingestao via evento, CDC ou batch — nunca query direta no banco transacional.
- ClickHouse: ingestao por batch ou Kafka engine. DuckDB: leitura de Parquet/CSV exportado do OLTP.
- Separacao entre producao de dados e consumo analitico e obrigatoria — sem acoplamento de schema.

### Modelagem de Eventos
- Schema de evento estavel e versionado. Campos minimos: `event_name`, `timestamp`, `entity_id`, `properties`.
- Particionamento por data obrigatorio. Retencao e compressao declarados no DDL.
- Colunas de baixa cardinalidade: usar `LowCardinality()` no ClickHouse para custo reduzido.
- Cardinalidade de colunas monitorada — colunas de alta cardinalidade sem agrupamento sao candidatas a remocao.

### Consultas de Avaliacao (Evals)
- Queries de evals versionadas em arquivos SQL — nunca inline no codigo de aplicacao.
- Resultados exportados para Parquet para auditoria e comparacao entre versoes de modelos.

## Segurança Obrigatória

- **PII em eventos ingeridos**: Dados de OLTP ingeridos no analytics devem ter campos sensiveis (CPF, CNPJ, numero de cartao, senha) removidos ou pseudonimizados antes da ingestao. Analytics nao e substituto de banco transacional seguro.
- **Controle de acesso ao cluster**: ClickHouse/DuckDB nao expostos publicamente. Acesso somente via rede privada ou VPN. Usuario de leitura com menor privilegio por perfil (analitica, dev, admin).
- **Retencao de dados com PII**: Tabelas com dados pessoais com politica de retencao documentada alinhada a LGPD/GDPR. Dados anonimizados ou expirados por TTL/lifecycle.
- **Queries de evals**: Resultados de evals que contenham inputs de usuarios (prompts, respostas) tratados como dados potencialmente sensiveis — nao exportar sem revisao de PII.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Evals de agentes e prompts | Fonte primaria transacional |
| Telemetria operacional e dashboards analiticos | Workloads com constraints relacionais fortes |
| Analise local de datasets (DuckDB) | Quando PostgreSQL com extensoes de analytics resolver sem custo adicional |
