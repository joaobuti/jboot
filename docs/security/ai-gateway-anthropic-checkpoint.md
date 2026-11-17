# Anthropic — Revisao Do Incremento De Credenciais

Data: 2026-10-15. Escopo: catalogo, validacao de chave e modelos. Nao e
aprovacao para producao ou execucao de prompts.

- Injection: queries parametrizadas; sem shell com input.
- Access control: tenant/owner do JWT; consulta de modelos restringe credencial
  ativa ao owner; scopes independentes para agentes e credenciais.
- Dados sensiveis: chave cifrada AES-GCM; apenas `last4` e metadados retornados;
  corpos e headers externos nao entram em logs ou erros.
- Mass assignment: DTO existente com whitelist; URL externa nao e campo de entrada.
- Rate limiting: guard global de 60 requisicoes/minuto; listagem local limitada
  a 100 registros e catalogo externo limitado a 1000 modelos/1 MiB.
- SSRF: host HTTPS fixo `api.anthropic.com`, redirects bloqueados e timeout 10s.
- Dependencias: nenhuma adicionada; audit de producao sem vulnerabilidades.
- Stack: chave existe somente na memoria do adapter; frontend nao persiste API key.
- GenAI: executor real com kill switch desabilitado por default, allowlist
  explicita de modelos, schema local, sem tools e sem mutacao de dominio.
- Idempotencia: hash de comando inteiro impede replay entre owners/agentes/origens.
- Quota: reserva PostgreSQL com advisory lock limita concorrencia e tentativas;
  cada chamada paga tem no maximo uma tentativa automatica.
- Dependencias adicionais: SDK oficial Anthropic e Ajv auditados sem vulnerabilidades.
- Concorrencia: nonce condiciona gravacao de validacao; testes cobrem troca e revogacao.

Pendencias bloqueantes para producao: politica de dados, KMS/rotacao, limites de
custo, allowlist operacional e integracao/smoke real. Testes de transporte com
erro HTTP sintetico verificam sanitizacao e nao comprovam contrato externo.
Nenhuma fixture de sucesso do provider foi fabricada.
