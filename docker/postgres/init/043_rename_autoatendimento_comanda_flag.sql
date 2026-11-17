\set ON_ERROR_STOP on
\connect jboot_identity

-- Renomeia a flag de tenant `autoatendimento_habilitado` para
-- `autoatendimento_comanda` em `client_applications.config` (aplicacao `pdv`).
--
-- Motivo: "autoatendimento" e generico -- totem, autoatendimento de caixa e
-- quiosque tambem sao autoatendimento. A flag governa exclusivamente o
-- cardapio publico do QR de mesa do modulo `comanda`
-- (`GET /catalog/public/menu/:clientId`), unico leitor da chave.
--
-- Nao e entitlement: `comanda` nao tem `application_slug` proprio (isenta por
-- nao ter sessao Identity persistente), entao o QR de mesa e um toggle de
-- feature dentro do contrato do PDV, nao um modulo contratado a parte.
--
-- Idempotente: apos rodar, nenhuma linha tem a chave antiga, entao reexecucao
-- e no-op. Este arquivo so roda automaticamente em volume Postgres novo; em
-- bases existentes (dev com dados e producao) precisa ser aplicado a mao.
UPDATE client_applications ca
SET config = (ca.config - 'autoatendimento_habilitado')
             || jsonb_build_object(
                  'autoatendimento_comanda',
                  ca.config -> 'autoatendimento_habilitado'
                ),
    updated_at = now()
FROM applications a
WHERE a.id = ca.application_id
  AND a.slug = 'pdv'
  AND ca.config ? 'autoatendimento_habilitado';
