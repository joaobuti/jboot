# AI Gateway OpenAI Interaction — Security Checklist

Data: 2026-10-15. Escopo: interacao manual read-only, response mode por versao,
capabilities de modelo e autenticacao s2s do gateway.

## Resultado

- [x] `client_id`, owner e `application_slug` da interacao manual derivam do JWT;
  o DTO aceita apenas `agentId`, `requestId` e `input`.
- [x] Scope `ai:execute` e exigido separadamente da validacao do token.
- [x] `Idempotency-Key` deve ser UUID identico ao `requestId`; reuso com payload
  diferente falha e replay nao dispara nova chamada paga.
- [x] Prompt, input e output integrais nao sao persistidos nem incluidos em
  auditoria; somente hashes, tokens, latencia, status, provider/modelo/versao.
- [x] Output manual e exibido como texto/JSON pelo React, sem HTML executavel.
- [x] Replay declara indisponibilidade do output efemero em vez de inventar ou
  refazer a resposta.
- [x] Provider deve estar habilitado e modelo deve constar na allowlist da
  capability correspondente a `text` ou `json_schema`.
- [x] Saida `json_schema` e validada localmente; saida `text` nao e executada
  nem aplicada ao dominio.
- [x] OpenAI usa SDK oficial com `store:false`, host controlado pelo adapter,
  timeout e retry automatico desabilitado.
- [x] Execucao s2s valida JWT do Identity com assinatura, issuer, audience
  `svc:ai-gateway`, `typ=service_access` e caller allowlisted.
- [x] O segredo bearer estatico anterior foi removido do codigo e do Compose.
- [x] Erros externos sao convertidos para codigos sanitizados; corpos do
  provider nao sao devolvidos ou logados.
- [x] DTOs usam allowlist e o limite de input permanece 64 KiB.
- [x] Testes automatizados cobrem isolamento, idempotencia, replay efemero,
  capabilities e tokens s2s invalidos.

## Remediacao do baseline de dependencias

- [x] Identity atualizado para NestJS `12.1.3` e Swagger `12.0.2`, com lockfile
  sincronizado, `npm ci` reprodutivel e `npm audit` sem vulnerabilidades.
- [x] Platform Web atualizado para Next.js `16.4.1`; o build predefinido e
  descontinuado do CKEditor foi substituido pelo pacote modular `ckeditor5
  49.0.0` e integracao React `12.0.0`.
- [x] SheetJS foi atualizado da distribuicao desatualizada do npm para o
  tarball oficial `0.20.3` do CDN autoritativo do projeto, preservando suporte
  a `.xlsx`, `.xls` e `.csv` e registrando URL/integridade no lockfile.
- [x] Axios, Firebase e Swiper foram atualizados; `@grpc/grpc-js` foi fixado em
  `1.14.6` via override porque o Firebase ainda limita a dependencia a uma
  faixa vulneravel. Testes e build validam a compatibilidade do override.
- [x] Dependencias de template sem consumidor (`echarts`,
  `echarts-for-react`, `quill`, `react-quilljs` e `react-router-dom`) foram
  removidas; o unico `Link` legado foi migrado para `next/link`.
- [x] `eslint-config-next` foi removido porque o flat config vigente nao o
  carregava e sua arvore mantinha uma vulnerabilidade sem versao corrigida.
- [x] Platform Web agora possui `package.json`/`package-lock.json` sincronizados,
  `npm ci` reprodutivel e `npm audit` completo sem vulnerabilidades.

Evidencias em container: Identity com 20 testes, typecheck, lint e build;
Platform Web com 109 testes, type-check, lint sem erros e build. As duas
aplicacoes passaram `npm ci` e `npm audit` com zero achados em 2026-10-15.

## Bloqueios de producao mantidos

- smoke externo com chave OpenAI real e fixture anonimizada capturada da fonte;
- politica de dados/DPA, residencia, retencao e uso para treinamento;
- KMS/secret manager e rotacao testada em ambiente produtivo;
- budgets monetarios, circuit breaker distribuido, cancelamento e reconciliacao;
- Architecture Graph registry/gate ainda nao operacional.

Enquanto houver item acima, `production_readiness` permanece `blocked`. O gate
de dependencias que impedia merge foi encerrado; os itens restantes impedem
promocao para producao, nao a integracao do incremento desabilitado por default.
