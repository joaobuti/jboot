# Agent: Domain Integrations

## Responsabilidade

Garantir integracoes cross-module dentro da Platform backend sem acoplamento
indevido entre dominios.

## Regras

- Cada integracao concreta deve ter adapter proprio, nomeado por origem/destino.
- O modulo orquestra contratos; regra de negocio especifica permanece no dominio
  dono dos dados.
- Nao receber `client_id`, `database_ref` ou destino sensivel por payload quando
  o backend consegue resolver pelo contexto.
- Validar capacidade contratada do produto destino server-side.
- Validar acesso ao registro de origem e ao destino antes de criar qualquer dado.
- Persistir referencia externa estruturada no destino para auditoria e
  idempotencia.
- Nao criar projeto separado sem novo Stack Fit Gate e confirmacao humana.
