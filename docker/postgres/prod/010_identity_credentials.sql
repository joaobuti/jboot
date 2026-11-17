-- Credenciais de producao das identidades canonicas
-- (docs/product/hostinger-vps-hosting-sprints.md, S1).
--
-- Os seeds canonicos de docker/postgres/init (003, 007, 008, 010, 014) criam o
-- Operador Senior (cpf 00000000191, cliente JBoot) e o Usuario Teste (cpf
-- 00011122233, cliente Demo JBoot) com e-mails example.local e hashes bcrypt de
-- desenvolvimento. Esses registros sao exigidos em producao (CLAUDE.md,
-- Identity/Platform Permissions); este arquivo troca e-mail e senha pelos
-- valores reais, lidos do ambiente do job de migracao.
--
-- Roda via `tools/db/migrate.sh --post docker/postgres/prod` a cada deploy;
-- e idempotente. Variaveis obrigatorias (hash bcrypt, nunca a senha em texto):
--   JBOOT_PROD_SENIOR_EMAIL
--   JBOOT_PROD_SENIOR_PASSWORD_HASH
--   JBOOT_PROD_DEMO_PASSWORD_HASH
-- Gerar hash: docker compose exec -T jboot bash -lc \
--   "cd implementations/bff-jboot-identity && node -e \"console.log(require('bcryptjs').hashSync(process.argv[1], 12))\" 'SENHA'"

\getenv senior_email JBOOT_PROD_SENIOR_EMAIL
\getenv senior_hash JBOOT_PROD_SENIOR_PASSWORD_HASH
\getenv demo_hash JBOOT_PROD_DEMO_PASSWORD_HASH

\if :{?senior_email}
\else
  \warn 'JBOOT_PROD_SENIOR_EMAIL ausente'
  SELECT 1/0;
\endif
\if :{?senior_hash}
\else
  \warn 'JBOOT_PROD_SENIOR_PASSWORD_HASH ausente'
  SELECT 1/0;
\endif
\if :{?demo_hash}
\else
  \warn 'JBOOT_PROD_DEMO_PASSWORD_HASH ausente'
  SELECT 1/0;
\endif

\c jboot_identity

BEGIN;

UPDATE identities
SET email = :'senior_email'
WHERE document_type = 'cpf' AND document_number = '00000000191';

UPDATE credentials c
SET secret_hash = :'senior_hash', status = 'active'
FROM identities i
WHERE c.identity_id = i.id
  AND c.credential_type = 'password'
  AND c.credential_ref = 'local'
  AND i.document_type = 'cpf' AND i.document_number = '00000000191';

UPDATE credentials c
SET secret_hash = :'demo_hash', status = 'active'
FROM identities i
WHERE c.identity_id = i.id
  AND c.credential_type = 'password'
  AND c.credential_ref = 'local'
  AND i.document_type = 'cpf' AND i.document_number = '00011122233';

-- Falha se algum hash de desenvolvimento sobreviveu (ex.: senha repetida).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM credentials
    WHERE secret_hash IN (
      '$2b$12$KVChOcBWq8O2HtcdsrZgnuQj1kGhsduoOjwEZ/1Vwuk121cquuP2W'
    )
  ) THEN
    RAISE EXCEPTION 'hash de senha de desenvolvimento presente em producao';
  END IF;
END $$;

COMMIT;
