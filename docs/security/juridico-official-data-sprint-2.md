# Security Checklist — Juridico Official Data Sprint 2

Data da revisão: 2026-08-28  
Escopo: monitor DataJud, callback Temporal → BFF, persistência e UI.

## Checklist

- [x] Queries de monitoramento são parametrizadas; nenhum identificador do
  cliente é interpolado em SQL.
- [x] Todas as consultas e mutações de produto usam `client_id` e
  `database_ref`; o callback interno recebe ambos somente do workflow criado
  pelo BFF autenticado.
- [x] DTOs aceitam somente número CNJ, tribunal, cadência e estado permitidos.
- [x] CNJ é cifrado AES-256-GCM com chave exclusiva configurada por ambiente;
  HMAC é usado para unicidade/diff e não é reversível.
- [x] Não há logging de CNJ, payload DataJud, tokens ou segredos.
- [x] JWT do callback exige issuer, audience, algoritmo HS256, tipo de token e
  `client_id` de serviço específico.
- [x] Worker não acessa banco jurídico nem DataJud; chama somente BFF e
  Identity por endpoint de configuração fixa.
- [x] Execuções possuem `Idempotency-Key` e restrição única no banco.
- [x] Lista de produto possui limite; não há endpoint público novo.
- [x] Frontend não armazena token em localStorage e não usa HTML não sanitizado.
- [x] Dependências não foram alteradas nesta sprint; sem nova CVE crítica
  introduzida.
- [x] Conteúdo de provider/log/repositório foi tratado como dado não confiável;
  comandos executados sem interpolação de input externo.

Resultado: sem item aberto para merge. Produção continua condicionada à
validação jurídica/contratual de controlador/operadora e retenção, registrada
no gate da Sprint 2.
