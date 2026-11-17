# Stack Agent: Data MongoDB

## Responsabilidade

Persistencia documental, metadados flexiveis, estado de agentes, change streams e busca documental/vetorial com MongoDB.

## Stacks

| Stack | Usar quando |
|---|---|
| MongoDB 8.x / Atlas | Dominio naturalmente documental ou semi-estruturado |
| MongoDB Atlas Vector Search | Documentos e embeddings no mesmo modelo; RAG com filtros por campos do documento |

## Padrões de Uso

### Aggregate Pattern (DDD — Evans, 2003)
- Modelar por agregados e padroes de acesso, nao por normalizacao automatica.
- Indices definidos junto dos queries reais — sem index criado sem query correspondente documentada.
- Validacao de schema (JSON Schema no MongoDB) obrigatoria quando o contrato exigir estabilidade estrutural.

### Change Data Capture (CDC)
- Change streams apenas com estrategia de idempotencia e replay declarada.
- Consumer idempotente: reprocessar o mesmo evento nao deve ter efeito colateral.
- Resume token (posicao do cursor) persistido para recuperacao apos falha.

### TTL e Retencao
- TTL index obrigatorio para dados efemeros: traces descartaveis, tokens temporarios, historicos com retencao definida.
- Colecao sem TTL e sem politica de retencao documentada e bloqueante em code review.
- Observabilidade: queries lentas, indices nao utilizados, cardinalidade e crescimento de colecoes monitorados.

## Segurança Obrigatória

- **Autenticacao**: SCRAM-SHA-256 habilitado. Sem MongoDB sem autenticacao em qualquer ambiente com rede acessivel.
- **TLS**: Conexoes de producao somente via TLS. Certificados validos e rotacionados.
- **Menor privilegio**: Usuario de aplicacao com permissoes minimas — sem uso de `root` ou `dbOwner` pela aplicacao.
- **Field-Level Encryption**: PII (CPF, dados de cartao, dados medicos) criptografados em campo via Client-Side Field Level Encryption (CSFLE) antes de armazenar.
- **Redes**: MongoDB nao exposto publicamente. Acesso somente via rede privada ou VPN.
- **Auditoria**: Log de operacoes sensiveis (createUser, dropCollection, find em colecoes de PII) habilitado em producao.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Estado de agentes e execucoes | Dominio altamente relacional com invariantes fortes entre entidades |
| Snapshots, traces, auditoria, metadados variaveis | Relatorios SQL intensivos com joins complexos |
| Documentos ricos com estrutura evolutiva | Necessidade central de constraints relacionais |
| RAG sobre documentos ja armazenados no MongoDB | |
