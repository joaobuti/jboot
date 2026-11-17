# Estudo: API Jusbrasil (Digesto) Como Capacidade Do Flow

Estado: estudo de viabilidade (2026-11-11). Nada planejado nem implementado. Uma integracao nova
exige PO -> PE -> Architect -> confirmacao humana antes de contrato e codigo.

Fonte: https://api.jusbrasil.com.br/docs/ (HTML estatico, lido em 2026-11-11). Todos os exemplos usam
a URL base `https://op.digesto.com.br/api/` (confirmar o host de producao com o suporte).

## Conclusao

Viavel tecnicamente: REST com `Authorization: Bearer <token>`, consulta unica por CNJ, monitoramento
diario com entrega por webhook e atualizacao sob demanda no tribunal. Encaixa como mais uma fonte da
capacidade de monitoramento processual (ADR 021/022), ao lado de DataJud e DJEN. Bloqueio: acesso,
modulos e preco so por contrato comercial (nao ha self-service nem sandbox documentado).

## O Que A API Oferece (documentado)

- Consulta unica: `GET /api/base-judicial/tribproc/<numero>` (modulo "(API) Base judicial: buscas
  de partes e analises resumida"). Retorna capa (`classes`, `classes_cnj`, `comarca`, `vara`, `juiz`,
  `valor`, `situacao`, `distribuicaoData`, `sentencaData`, `segredo_justica`...), `partes`, `movs`,
  `anexos`, `audiencias`. `atualiza_tribunal=true` pede atualizacao (no maximo 1 por 24 h por
  processo); `id_update_callback` gera evento 13.
- Tuplas posicionais documentadas:
  - `partes` (0-16): ids, nome, nome normalizado, CNPJ, CPF (so quando confirmado), documento
    formatado, papel, `advogados` (id, nome, OAB, CPF, UF), autor/co-autor/reu/neutro, CEP,
    `monitored_person` que deu match, pessoa fisica.
  - `movs` (0-6): data, tipo (texto do tribunal), texto, juiz, id, classificacao automatica, instancia.
  - `anexos` (0-7): id, URL (vale 7 dias; `POST /api/monitoramento/monitored_event/renew_gcs_lease`
    renova por 15), tipo (1 Inicial, 2 Sentenca, 5 Acordao, 6 Despacho, 10 Procuracao...), datas,
    texto, id da movimentacao, titulo.
- Monitoramento de processo: `POST /api/monitoramento/proc` (`numero`, `is_monitored_tribunal`,
  `is_monitored_diario`, `user_custom` ate 256, `instancia`). Envio comeca 48 h depois; primeiro
  envio traz os ultimos 16 dias; historico completo so com o suporte. Listagem por
  `GET /api/monitoramento/proc` com `where`, `page`/`per_page` (max 2048), `X-Total-Count`.
- Eventos (`evt_type`): 1 movimentacoes/mudancas; 2 publicacoes; 4 novos processos (distribuicao);
  8 problemas de monitoramento (`data.reason`; `target_number` so digitos); 13 atualizacao sob
  demanda; 18 OAB; 20 confirmacao de verificacao diaria. `id` do evento passa de 32 bits em
  dez/2026: guardar como BIGINT/texto.
- Webhook: `POST /api/admin/user_company/current_webhook_config` (`url`); autenticacao opcional
  OAuth 2.0 client credentials (`POST /api/webhook_auth_config`, token reutilizado ate 55 min);
  sucesso = HTTP 200 em ate 10 s; ate 13 retentativas com intervalo dobrando (ate ~5 dias), depois
  descarta. Chamadas pendentes em `GET /api/monitoramento/webhook_call`.
- Distribuicao (novos processos de uma parte): `POST /api/monitoramento/monitored_person` (`nome`);
  bloqueios por excesso de processos/variacoes; sem trabalhistas pelo nome do autor (Res. CNJ
  121/2010); sem processos em segredo de justica.
- Limites: 5000 requisicoes/dia e 120/minuto por usuario (429); limites de entidade por empresa
  (numeros nao publicados).

## Nao Documentado / A Confirmar

Preco e modelo de cobranca; sandbox; host de producao; IPs de origem do webhook; como parar o
monitoramento de um processo (DELETE/PATCH de `proc`); estrutura de `audiencias` e do evento 4;
cobertura e SLA (`referencias/cobertura_fontes.html`, `referencias/sla.html`, nao lidos); segredo de
justica (credenciais, descriptografia); termos de uso, LGPD e repasse dos dados.

## Insumos Para Planejar

1. Contrato: modulos (consulta unica, monitoramento de processos, distribuicao, anexos/autos,
   publicacoes) e modelo de cobranca; limites de entidade.
2. Credenciais: token de teste e producao, id de usuario e empresa, host, sandbox.
3. Webhook: URL publica HTTPS do BFF e decisao de usar OAuth 2.0 client credentials.
4. Respostas reais (regra de fixtures): consulta unica de processos ja monitorados e um payload real
   de webhook.
5. Produto: o que entra no Flow e se complementa ou substitui DataJud/DJEN (evitar pagar duas vezes
   pelo mesmo processo). Busca por OAB segue so no Juridico.
6. Termos: guarda de CPF/CNPJ e texto de anexos, retencao, exibicao ao cliente final.
