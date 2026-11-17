# Platform Files Sprints

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: sprint artifact criado em 2026-08-27 para servico horizontal de upload
last_status_review: 2026-08-27
```

## Decisoes De Escopo

- Upload de arquivos deve ser centralizado em `platform-files`, com metadados auditaveis de origem.
- Dominios consumidores continuam donos do vinculo semantico. Exemplo: `catalog` decide que um arquivo e imagem principal do produto.
- O frontend nunca envia `client_id`, `storage_key` ou bucket. Esses valores sao derivados no backend a partir do contexto autenticado e da origem validada.
- URLs permanentes publicas nao entram na v1. Recuperacao usa URL assinada com TTL curto.
- Stack confirmada: NestJS `FileInterceptor`/Multer + AWS SDK v3 + MinIO/S3-compatible + Postgres.
- Alternativa rejeitada: campo manual `imageUrl` no produto. Motivo: nao implementa upload real, espalha origem do arquivo no frontend e perde rastreabilidade.

## Sprint 1 - Servico Horizontal De Arquivos

Estado: concluida.

Objetivo: criar modulo reutilizavel para registrar, armazenar e recuperar arquivos da Platform.

Entregaveis:

- modulo backend `src/modules/platform-files`;
- tabela `platform_files`;
- storage key gerada server-side com `client_id/source_module/source_entity_type/source_entity_id/file_id`;
- bucket S3-compatible configuravel por `JBOOT_PLATFORM_FILES_BUCKET`;
- upload em memoria via Multer, validando tamanho e MIME por uso;
- URL assinada de download com TTL curto;
- testes automatizados de validacao de arquivo, origem e geracao de metadados.

Criterios de aceite:

- arquivo invalido por MIME/tamanho e rejeitado antes de gravar metadata;
- query de metadata sempre filtra por `client_id`;
- origem da request fica persistida;
- `storage_key` nao e aceita do client;
- modulo pode ser chamado por outros dominios via service exportado.

Fora de escopo:

- CDN publica;
- processamento de imagem, crop, resize e thumbnails;
- antivirus/DLP;
- upload multipart direto browser -> S3;
- versionamento visual de assets.

Debitos conhecidos:

- Politicas de lifecycle/retencao de producao dependem do provider real de storage.
- Checksum forte pode entrar na proxima sprint quando o client enviar hash do arquivo.

## Sprint 1.1 - Imagem De Produto No Catalogo/Comanda

Estado: concluida.

Objetivo: permitir upload de imagem no cadastro de produto e exibir no cardapio publico da comanda.

Entregaveis:

- `catalog_products.image_file_id`;
- endpoint autenticado `POST /catalog/products/:id/image`;
- cadastro de produtos com upload de imagem na etapa de dados;
- menu publico retorna `description` e `imageUrl` assinada quando houver imagem;
- tela publica da comanda renderiza imagem opcional antes do nome, linha expansivel e botao `+` no fim da mesma linha.

Criterios de aceite:

- somente usuario com `pdv:admin:write` envia imagem de produto;
- produto pertence ao `client_id` do token antes de aceitar upload;
- menu publico nao vaza arquivo de outro tenant;
- cardapio continua funcional para produtos sem imagem e sem descricao.

Fora de escopo:

- galeria com multiplas imagens por produto;
- imagem por categoria;
- crop/editor de imagem;
- cache/CDN.
