# Stack Agent: Data Vector Search

## Responsabilidade

Busca vetorial dedicada quando PostgreSQL/pgvector ou MongoDB Vector Search nao forem suficientes.

## Stacks

| Stack | Usar quando |
|---|---|
| Qdrant | Vector search dedicado, filtros por metadados, operacao focada e menor footprint |
| Weaviate | Schema integrado, busca hibrida, recursos multi-modal |
| Milvus | Escala muito alta, ecossistema vetorial especializado |

## Padrões de Uso

### RAG Pipeline (Lewis et al., 2020)
- Separar etapas com interfaces proprias: chunking → embedding → storage → retrieval → reranking.
- Embedding model versionado e documentado: modelo, dimensao, metrica de distancia, normalizacao.
- Estrategia de reindexacao definida antes de producao — mudanca de modelo implica reindexacao total.

### Avaliacao de Retrieval
- Metricas obrigatorias por versao: recall@k, precisao@k, latencia p50/p99, custo por query.
- Filtros por metadados testados com casos de borda antes de producao.
- Resultados exportados e versionados para comparacao entre modelos de embedding.

## Segurança Obrigatória

- **PII em embeddings**: Documentos com CPF, dados medicos, dados financeiros ou qualquer PII nao devem ser vetorizados sem remocao ou pseudonimizacao previa. Embedding encapsula o texto original — PII pode ser recuperado por ataques de inversao de embedding.
- **Controle de acesso ao indice**: Vector database nao exposto publicamente. Acesso somente via rede privada com autenticacao obrigatoria (API key ou mTLS).
- **API key do modelo de embedding**: Chave em variavel de ambiente — nunca hardcoded. Rotacionar periodicamente.
- **Isolamento por tenant**: Em ambientes multi-tenant, colecoes separadas por tenant ou filtro obrigatorio por `tenant_id` em toda query. Sem compartilhamento de espaco vetorial entre tenants.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Grande volume vetorial com exigencia alta de recall/latencia | RAG pequeno resolvido por pgvector |
| Filtros vetoriais complexos por metadados | Documentos ja em MongoDB com Atlas Vector Search suficiente |
| Operacao vetorial dedicada e especializada | Prototipo onde mais um banco aumenta custo operacional sem ganho claro |
