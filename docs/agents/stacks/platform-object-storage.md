# Stack Agent: Platform Object Storage

## Responsabilidade

Storage de objetos para artefatos, anexos, datasets, exports, snapshots e outputs de IA.

## Stacks

| Stack | Usar quando |
|---|---|
| AWS S3 | Default quando AWS e aceitavel; ecossistema e integracao amplos |
| Cloudflare R2 | S3-compatible com custo zero de egress |
| MinIO | S3-compatible self-hosted ou ambiente local de desenvolvimento |

## Padrões de Uso

### Organizacao de Buckets e Chaves
- Buckets separados por ambiente (`prod`, `staging`, `dev`) e por classificacao de dados.
- Chaves deterministicas e versionaveis: `<tenant>/<dominio>/<entity-id>/<versao>/<nome-arquivo>`.
- Sem paths aleatorios ou baseados apenas em timestamp sem estrutura hierarquica.

### Acesso e Seguranca
- URLs assinadas (presigned URLs) com TTL minimo viavel — nunca URLs publicas permanentes para dados privados.
- Criptografia server-side e controle de acesso por IAM/policy explícito por bucket.
- Content-type e checksums (MD5 ou SHA256) verificados no upload.

### Retencao e Lifecycle
- Politica de lifecycle declarada: expirar versoes antigas, mover para storage frio apos N dias.
- Outputs de IA (imagens, audio, PDFs) com retencao alinhada ao SLA do produto.
- Sem bucket sem politica de retencao documentada em producao.

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Arquivos grandes, datasets, anexos | Dados transacionais pequenos que exigem query rica |
| Outputs de IA: imagens, audio, video, PDFs, exports | Estado operacional de baixa latencia |
| Snapshots e artefatos de avaliacao versionados | |
