# /jboot-runtime-profile

## Objetivo

Governar alteracoes de runtime local e operacional, documentando o que sobe por target e quais validacoes demonstram que o ambiente esta integro.

## Uso

```text
/jboot-runtime-profile target=<project> module=<module-opcional> change="<mudanca>"
```

Exemplos:

```text
/jboot-runtime-profile target=implementations/bff-jboot-platform change="novo seed catalog"
/jboot-runtime-profile target=implementations/app-jboot-next-platform module=modules/pdv change="dependencia runtime para PDV"
```

## Quando Usar

Obrigatorio ao criar projeto/modulo ou alterar:

- `docker-compose.yml`;
- `Makefile`;
- `tools/dev-up.sh` ou scripts equivalentes;
- seeds;
- healthchecks;
- portas;
- workers;
- dependencias de runtime;
- perfis/targets de subida local;
- variaveis de ambiente operacionais.

## Entradas

Obrigatorias:

- `target`: projeto alvo.
- `change`: mudanca de runtime.

Opcionais:

- `module`: modulo alvo.
- `profile`: target/profile afetado.
- `ports`: portas esperadas.
- `services`: servicos afetados.

## Preflight

1. Identificar `target_project`.
2. Identificar `target_module` quando aplicavel.
3. Carregar contratos.
4. Acionar `docs/skills/dev-runtime-profile/SKILL.md`.
5. Verificar se a mudanca tambem exige `/jboot-security-review`.

## Agents E Skills

Usar:

- `docs/skills/dev-runtime-profile/SKILL.md`
- Agent local responsavel por runtime/backend/infra do projeto.

Referenciar:

- `docs/agents/orchestration/product-engineer.md`: para garantir que o contrato declare o que sobe por target.

## Fluxo

1. Mapear arquivos de runtime afetados.
2. Definir targets/profiles.
3. Declarar servicos que sobem por target.
4. Declarar portas e healthchecks.
5. Declarar seeds e ordem de execucao.
6. Declarar workers e dependencias.
7. Atualizar `PROJECT_CONTRACT.md` ou `MODULE_CONTRACT.md`.
8. Rodar validacao de subida quando aplicavel.
9. Registrar pendencias e riscos.

## Bloqueios

Bloquear quando:

- runtime mudar sem contrato atualizado;
- target de modulo subir infra ampla sem profile explicito `full`;
- seed obrigatorio de novo modulo/app nao conceder entitlement dev;
- porta/healthcheck ficar ambigua;
- worker ou dependencia operacional nao estiver documentado;
- validacao de subida falhar sem risco aceito.

## Saida Esperada

```text
AI Command:
  command: /jboot-runtime-profile
  target_project:
  target_module:
  mode: runtime-profile
  status:

Runtime Profile:
  changed_files:
  targets:
  services:
  ports:
  healthchecks:
  seeds:
  workers:
  environment:
  validations:
  open_risks:
```

## Nao Faz

- Nao substitui contrato de projeto/modulo.
- Nao aprova runtime parcialmente documentado.
- Nao cria profile `full` implicito para modulo.
