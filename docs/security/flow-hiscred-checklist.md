# Flow — HISCON e HISCRED (2026-10-21)

Escopo: catalogo fixo da ficha, cliente tipado, prompt sugerido e migration 095.

- [x] Injection: SQL estatico; uploads continuam usando queries parametrizadas.
- [x] Access control: mesmas verificacoes de tenant, visibilidade e scopes do fluxo existente; teste de isolamento para HISCRED.
- [x] Dados sensiveis: nenhum dado de cliente, arquivo ou segredo adicionado a logs/commits.
- [x] Mass assignment: somente `hiscred` adicionado a allowlist; nenhuma entrada livre nova.
- [x] Rate limiting/paginacao: N/A, nenhuma rota ou consulta de listagem nova.
- [x] SSRF: N/A, nenhuma URL ou chamada externa nova.
- [x] Dependencias: N/A, nenhuma dependencia ou lockfile alterado por esta entrega.
- [x] Stack: mesmo storage privado, limites, MIME/assinatura, versionamento e download assinado.
- [x] GenAI: prompt exige todos os documentos e preserva fronteira dados/instrucoes; teste de regressao; nenhuma inferencia paga.
- [x] Operacao: migration transacional e reexecutavel; HISCON mantem chave e historico; mesmo target/portas.

Sem itens abertos neste escopo. Testes nao substituem os smokes externos pendentes da sprint original.

## S6 — Paginas, PDF Com Senha, Situacao Por Documento E Dados Extraidos (2026-10-21)

- [x] Injection: `fillEmpty` monta colunas so a partir da allowlist `FIELD_COLUMNS`; valores parametrizados com cast explicito.
- [x] Access control: `extractedData` so entra pelo `flow_submit_customer_validation`, que exige run `dispatched` do executor/responsavel; `fillEmpty` exige o cliente no `client_id` (outro tenant 404, teste com PostgreSQL real).
- [x] Integridade da ficha: o SQL usa `COALESCE` com o valor gravado; valor digitado nunca e sobrescrito, mesmo em corrida.
- [x] Mass assignment: so os 11 campos de `customer_juridico` aceitos; chave desconhecida descartada (zod sem passthrough + normalizador); data real, UF valida e tamanho da coluna.
- [x] Dados sensiveis: auditoria `kanban_customer_validation_data_applied` so com nomes de campos; nenhum valor em log; teste confere.
- [x] Arquivo nao confiavel: PDF aberto pelo pdfjs sem eval antes do storage; com senha ou corrompido e recusado (422) sem gravar; teto de 100 paginas por documento.
- [x] GenAI: conteudo dos documentos segue como dado; o dado extraido e tratado como entrada nao confiavel e nunca valida o cliente (confirmacao humana mantida).
- [x] Auditoria: leitura global de admin nao duplica por tool do conector; a tool continua auditada com o run.
- [x] Operacao: migration 096 transacional e reexecutavel; CHECK de tamanho do `extracted_data`.

Sem itens abertos neste escopo. Smoke real da rotina com `extractedData` pendente.
