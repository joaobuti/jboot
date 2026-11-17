# Payments Sprint 1 Security Checklist

```yaml
date: 2026-10-04
scope: payments_foundation
target_project: implementations/svc-jboot-payments
review_status: passed_for_sprint_1_scope
open_items: 0
production_readiness: blocked
```

O checklist aprova somente a fundacao provider-neutral da Sprint 1. Nao aprova
adapter InfinitePay, deploy, ativacao de tenant ou operacao em producao.

## 1. Injection

- [x] Queries PostgreSQL usam parametros posicionais; nenhuma entrada participa
  de SQL por concatenacao.
- [x] Migrations sao estaticas e incorporadas ao binario.
- [x] O servico nao executa comandos de sistema derivados de request.

## 2. Access Control

- [x] Endpoints de cobranca exigem JWT s2s com algoritmo HS256 fixo, issuer,
  audience `svc:payments`, type `service_access` e caller allowlisted.
- [x] Autenticacao do caller e autorizacao da capability `payments` sao
  verificacoes independentes.
- [x] O tenant vem de `X-JBoot-Client-Id`, e toda leitura/escrita de cobranca e
  chave estrangeira relevante inclui `client_id`.
- [x] O DTO de saida e explicito e nao serializa entidade de persistencia.
- [x] Testes automatizados cobrem isolamento entre tenants.

## 3. Dados Sensiveis

- [x] Logs estruturados nao registram bearer token, InfiniteTag, CPF/CNPJ,
  dados de cartao, segredo BYOA ou payload externo.
- [x] O Payments nao armazena nome, documento ou endereco do pagador.
- [x] Segredos sao recebidos por ambiente; `.env.example` contem somente
  placeholders e defaults locais nao secretos.
- [x] O modelo de conexao provider persiste `secret_ref`, nunca segredo em
  claro.
- [x] Senhas: N/A, o servico nao cadastra nem armazena senha.

## 4. Mass Assignment

- [x] Request de criacao usa DTO dedicado e rejeita campos desconhecidos.
- [x] `client_id`, status, provider, timestamps e identificadores internos nao
  podem ser definidos pelo body.
- [x] Body HTTP limitado a 16 KiB.

## 5. Rate Limiting E Paginacao

- [x] Listagens: N/A, a Sprint 1 nao expoe endpoint de lista.
- [x] Endpoint publico: N/A, todas as rotas de negocio sao internas s2s.
- [x] Queries singulares usam chaves unicas ou `LIMIT 1`; claim do outbox usa
  lote limitado.
- [x] Limites por provider/conta permanecem gate do adapter porque a InfinitePay
  nao publica rate limit confiavel; isso nao deixa endpoint publico exposto.

## 6. SSRF

- [x] A fundacao nao faz chamada HTTP a provider.
- [x] Adapters futuros devem usar host fixo/allowlisted; URL enviada pelo
  consumidor nunca sera destino de request.

## 7. Dependencias

- [x] `govulncheck ./...` executado dentro do container com Go 1.25.13 e sem
  vulnerabilidade conhecida em simbolo chamado.
- [x] A imagem do servico fixa Go 1.25.13 e runtime distroless nonroot.
- [x] `npm audit` do Identity nao encontrou vulnerabilidade critica.
- [x] Nove achados high, tres moderate e um low ja existentes em dependencias
  transitivas do Identity foram registrados como risco conhecido; a Sprint 1
  nao adicionou dependencia Node nem alterou o lockfile.

## 8. Stack-Specific

- [x] Processo final roda como usuario nonroot em imagem distroless.
- [x] IDs usam UUID e nao sao tokens de autenticacao.
- [x] Comunicacao externa: N/A nesta Sprint; adapter futuro exige TLS e
  validacao de host.
- [x] Frontend, mobile e desktop: N/A, o servico nao possui UI.

## 9. Agentes De Engenharia E GenAI

- [x] Conteudo de web, fixture, log e tool output foi tratado como dado nao
  confiavel.
- [x] Nenhuma instrucao indireta alterou a hierarquia canonica.
- [x] As ferramentas usadas estavam dentro da matriz de autoridade do
  repositorio e do escopo autorizado pelo usuario.
- [x] Nao houve deploy, ativacao externa, operacao destrutiva ou persistencia
  de segredo real.
- [x] Fixtures externas sao respostas reais anonimizadas com proveniencia.
- [x] Attestation nao contem segredo, PII ou afirmacao de producao.

## Riscos Que Continuam Bloqueando Producao

Estes itens nao sao lacunas da fundacao aprovada; sao escopo obrigatorio das
sprints de adapter e hardening antes de producao:

- autenticidade, replay e payload real do webhook InfinitePay;
- estados negativos, expiracao, cancelamento, devolucao e settlement reais;
- ownership robusto e isolamento de multiplas contas BYOA;
- contrato do primeiro tenant pagante e revisao juridica/contabil/LGPD;
- benchmark, envelope de capacidade, rate limits e alertas medidos;
- resolucao dos achados high/moderate do Identity antes de sua propria
  classificacao como `production_ready`.
