# Stack Agent: Backend Python

## Responsabilidade

Servicos de IA, RAG, pipelines de dados, automacoes, APIs Python e avaliadores.

## Stacks

| Stack | Usar quando |
|---|---|
| Python 3.13/3.14 + FastAPI | APIs de IA, streaming, validacao Pydantic, ecossistema Python |
| LangGraph | Agentes stateful, workflows longos, human-in-the-loop, memoria duravel |
| LlamaIndex | Ingestao, recuperacao, RAG, conectores de dados |
| Celery/RQ/Arq | Execucao assincrona e filas de tarefa |
| Temporal | Workflows criticos com durabilidade e retry garantidos |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: funcao ou metodo > 20 linhas ou 3+ niveis → decompor em funcoes auxiliares antes de merge.
- **OCP**: extensao via injecao de dependencia ou protocolos, nao via modificacao de funcao central.
- **DIP**: logica de dominio depende de abstracao, nao de implementacao concreta de provider de IA ou storage.

### Modular Monolith (Grzybek, 2019; Newman, Monolith to Microservices 2019)
- Deploy unitario com fronteiras de pacote verificaveis. Cada pacote corresponde a um Bounded Context (DDD — Evans, 2003).
- `__init__.py` de cada pacote define a interface publica. Nao importar classes internas de outro pacote diretamente.
- Comunicacao entre dominios via servico publico ou evento. Sem acesso direto a modelo de dados de outro dominio.
- Pacote com dependencia de implementacao interna de outro e bloqueante antes de merge.
- Cada pacote e extraivel para servico independente sem reescrita de dominio.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Router/Handler → Service/UseCase → Repository/Gateway`.
- Handler: recebe HTTP, valida schema Pydantic, delega. Sem logica de dominio.
- Service/UseCase: logica de negocio, orquestracao de prompt, validacao de invariante.
- Repository/Gateway: acesso a dados, chamada a modelo, storage. Sem regra de negocio.
- Schema Pydantic: validacao de contrato de entrada. Funcoes internas nao relancam erro por dado rejeitavel na borda.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Chamadas a sistema externo (HTTP, fila, storage, modelo de IA) em modulo dedicado com sufixo `gateway`, `adapter` ou `client`.
- Porta de entrada: schema Pydantic validado. Porta de saida: tipo de retorno estruturado do adapter.
- Dominio nao importa detalhes de HTTP, API key ou formato de provider.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002; Richardson, Microservices Patterns 2018)
- **Gateway Pattern** (Fowler): `build_payload`, `call`, `parse_response` em funcoes separadas. Timeout e retry declarados por chamada.
- **Repository Pattern** (Fowler): acesso a dados atras de interface. Service nao constroi query diretamente.
- **Strategy Pattern** (GoF): troca de provider de IA via injecao, sem condicional no core.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre duas funcoes do mesmo modulo → extrair funcao auxiliar compartilhada antes de continuar.
- > 30% de sobreposicao entre dois metodos publicos → extrair funcao compartilhada.

### Observabilidade (OpenTelemetry — CNCF, 2021)
- Traces, metricas e logs via SDK OpenTelemetry. Sem vendor lock-in — exportar para Jaeger, Prometheus, OTLP.
- Span em toda chamada externa: atributos `http.method`, `http.url`, `db.statement` (sem dados sensiveis), flag `error`.
- Logs estruturados em JSON: campos `level`, `timestamp`, `trace_id`, `span_id`, `message`. Sem string concatenation.
- Metricas de negocio como instrumentos OTel (Counter, Histogram). Nao usar logs de texto como substituto de metrica.
- Logs de modelo de IA obrigatorios: prompt tokens, completion tokens, custo, latencia e fonte de contexto como atributos OTel.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Funcao > 20 linhas → candidata obrigatoria a revisao de SRP.
- Cognitive Complexity > 15 → decompor (SonarQube default).
- Aninhamento > 3 niveis → extrair funcao auxiliar.
- Logs de modelo obrigatorios: prompt tokens, completion tokens, custo, latencia e fonte de contexto.

## Segurança Obrigatória

### OWASP Top 10 (2021) + OWASP API Security Top 10 (2023)
- **Injection (A03)**: Queries sempre parametrizadas via ORM ou prepared statements. Sem f-string com input de usuario em SQL ou comandos de sistema.
- **Broken Access Control (A01 / API1:2023)**: Verificar ownership do recurso no inicio de cada endpoint. Dependencias FastAPI para injetar contexto de autorizacao — sem confiar em input do usuario para identificar o tenant.
- **Broken Object Property Level (API3:2023)**: Schema Pydantic de saida explicito por endpoint — sem `return model.__dict__` ou `model_dump()` de entidade completa.
- **Cryptographic Failures (A02)**: Senhas → `passlib` com bcrypt ou Argon2. Sem MD5/SHA1. `secrets.token_hex()` para tokens — nunca `random`. Segredos via `pydantic-settings` ou equivalente, nunca hardcoded.
- **Dados sensiveis em logs**: Nunca logar CPF, CNPJ, senha, token, chave de API, tokens de modelos de IA, conteudo de prompt com PII.
- **SSRF (A10 / API7:2023)**: URL construida a partir de input do usuario exige allowlist explicita. Cuidado com LLM que pode gerar URLs a partir de instrucoes do usuario (prompt injection → SSRF).
- **Rate Limiting (API4:2023)**: Rate limiting em endpoints publicos. Paginacao obrigatoria em listagens.
- **Dependencias (A06)**: `pip audit` ou `safety check` antes de deploy em producao.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `pyright src/` | Sempre |
| `pytest --tb=short` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| IA e o centro da implementacao | API CRUD simples sem IA (Node/PHP entregam mais velocidade) |
| Pipelines, embeddings, classificacao, RAG, automacao analitica | Servico de baixa latencia onde Go e mais apropriado |
| Bibliotecas de ML/data indispensaveis | |
