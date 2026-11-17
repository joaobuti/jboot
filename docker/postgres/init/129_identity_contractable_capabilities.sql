\set ON_ERROR_STOP on
\connect jboot_identity

-- Capacidades contrataveis sem produto no cadastro do cliente (ADR 022,
-- docs/product/process-monitoring-sprints.md, Sprint 10).
--
-- `monitoramento-processual` (DataJud) e `publicacoes-processuais` (DJEN) nao
-- pertencem a uma application (servem ao Juridico e ao Flow), entao a tela do
-- Identity, que agrupa capability por application, nao as mostrava: so dava
-- para contratar pelo banco. `client_contractable` marca a capability sem
-- application que o operador liga por cliente; as s2s internas (ai-gateway,
-- juridico-data, payments) continuam fora da tela. `requires_capability` guarda
-- a dependencia (DJEN exige DataJud), validada no BFF e refletida na tela.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.

BEGIN;

ALTER TABLE capability_registry
  ADD COLUMN IF NOT EXISTS client_contractable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_capability text REFERENCES capability_registry (slug);

UPDATE capability_registry
   SET client_contractable = true
 WHERE slug IN ('monitoramento-processual', 'publicacoes-processuais');

-- A dependencia sai da descricao: a tela mostra "Exige ..." a partir da coluna.
UPDATE capability_registry
   SET requires_capability = 'monitoramento-processual',
       description = 'Publicações e intimações do DJEN por número de processo nos acompanhamentos do Flow'
 WHERE slug = 'publicacoes-processuais';

COMMIT;
