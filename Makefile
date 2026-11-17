.PHONY: infra-build infra-up infra-down infra-ps infra-logs shell code-up code-down code-restart dev-up dev-up-all identity-backend-dev identity-frontend-dev platform-frontend-dev pdv-frontend-dev juridico-backend-dev juridico-frontend-dev juridico-worker-dev juridico-data-dev payments-dev ai-gateway-dev juridico-pje-seed-credentials observability-up observability-down observability-restart observability-ps observability-logs observability-validate observability-smoke observability-root-smoke ai-context ai-adapters ai-runtime-check ai-contract-check ai-preflight-sample ai-evals ai-behavioral-evals ai-conformance ai-evidence ai-diff-check ai-mr-check ai-report ai-record-sample ai-check contract-tests deploy ai-api-graph ai-api-graph-gate ai-api-impact ai-api-context ai-architecture-graph ai-architecture-graph-gate ai-architecture-context ai-architecture-impact ai-architecture-graph-viewer claude-tunnel

infra-build:
	docker compose build jboot

infra-up:
	docker compose up -d

infra-down:
	docker compose down

infra-ps:
	docker compose ps

infra-logs:
	docker compose logs --tail=120

shell:
	docker compose exec jboot bash

code-up:
	bash tools/code-up.sh $(TARGET)

# Conector Claude em dev: tuneis + reconfiguracao do Flow (docs/runbooks/claudeconf.md).
claude-tunnel:
	bash tools/dev/claude-tunnel.sh $(ARGS)

code-down:
	bash tools/code-down.sh $(TARGET)

code-restart: code-down code-up

deploy:
	bash tools/deploy.sh $(TARGET)

dev-up:
	bash tools/dev-up.sh $(TARGET)

dev-up-all:
	bash tools/dev-up.sh all

identity-backend-dev:
	docker compose exec jboot bash -lc 'cd implementations/bff-jboot-identity && JBOOT_IDENTITY_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_identity npm run start:dev'

identity-frontend-dev:
	docker compose exec jboot bash -lc 'cd implementations/app-jboot-identity-admin && npm run dev'

platform-frontend-dev:
	docker compose exec jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run dev'

pdv-frontend-dev:
	docker compose exec jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run dev'

juridico-backend-dev:
	docker compose exec jboot bash -lc 'cd implementations/bff-jboot-platform && JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev npm run start:dev'

juridico-frontend-dev:
	docker compose exec jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run dev'

juridico-worker-dev:
	docker compose exec jboot bash -lc 'cd implementations/wrk-jboot-juridico && JBOOT_WORKER_API_PORT=8020 JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev uv run python -m src.workers.main'

juridico-data-dev:
	docker compose exec jboot bash -lc 'cd implementations/svc-jboot-juridico-data && uv run uvicorn juridico_data.app:app --host 0.0.0.0 --port 8030'

payments-dev:
	docker compose exec jboot bash -lc 'cd implementations/svc-jboot-payments && /usr/local/go/bin/go run ./cmd/api'

ai-gateway-dev:
	docker compose exec jboot bash -lc 'cd implementations/svc-jboot-ai-gateway && npm run start:dev'

juridico-pje-seed-credentials:
	@set -a; [ -f .env ] && . ./.env; set +a; \
	docker compose exec \
		-e JURIDICO_PJE_DEV_EMAIL="$$JURIDICO_PJE_DEV_EMAIL" \
		-e JURIDICO_PJE_DEV_PASSWORD="$$JURIDICO_PJE_DEV_PASSWORD" \
		jboot bash -lc 'cd implementations/bff-jboot-platform && npx ts-node scripts/seed-pje-dev-credentials.ts'

observability-up:
	implementations/ops-jboot-observability/bin/up.sh

observability-down:
	implementations/ops-jboot-observability/bin/compose.sh down

observability-restart: observability-down observability-up

observability-ps:
	implementations/ops-jboot-observability/bin/compose.sh ps

observability-logs:
	implementations/ops-jboot-observability/bin/compose.sh logs --tail=200

observability-validate:
	implementations/ops-jboot-observability/bin/validate.sh

observability-smoke:
	implementations/ops-jboot-observability/bin/smoke.sh

observability-root-smoke:
	implementations/ops-jboot-observability/bin/root-forward-smoke.sh

ai-context:
	tools/ai/generate-ai-context.sh --force

ai-adapters:
	python3 tools/ai/sync-runtime-adapters.py --write

ai-runtime-check:
	tools/ai/validate-runtime-adapters.sh

ai-contract-check:
	tools/ai/validate-contract-adapters.sh

ai-preflight-sample:
	tools/ai/preflight-check.sh --project implementations/bff-jboot-platform --module modules/pdv --gate docs/product/pdv-sprint-1-gate.md --activation-file docs/ai-governance/evals/sample-agent-activation.txt

ai-evals:
	tools/ai/run-evals.sh

ai-behavioral-evals:
	python3 tools/ai/behavioral-evals.py
	python3 -m unittest discover -s tools/ai/tests -p 'test_*.py'

ai-conformance: ai-behavioral-evals
	python3 tools/ai/sync-runtime-adapters.py
	python3 tools/ai/governance.py validate

ai-evidence: ai-conformance
	python3 tools/ai/governance.py evidence

ai-diff-check:
	python3 tools/ai/diff-preflight.py --allow-working-tree-revision

# Reproduz o gate do CI de merge request: valida o diff commitado contra a base
# (o job usa CI_MERGE_REQUEST_DIFF_BASE_SHA) e nao aceita revision working-tree.
# Use antes de abrir MR: make ai-mr-check [BASE=origin/main]
ai-mr-check:
	python3 tools/ai/diff-preflight.py --base $(if $(BASE),$(BASE),origin/main)

# Grafo de contratos HTTP (rotas x consumidores) em tmp/ai/api-graph.json.
ai-api-graph:
	python3 tools/ai/api-graph.py --fail-on $(if $(FAIL_ON),$(FAIL_ON),none) $(if $(VERBOSE),--verbose,)

# Gate bloqueante: drift de contrato nao aceito ou entrada obsoleta em tools/ai/api-graph-accepted.yaml.
ai-api-graph-gate:
	python3 tools/ai/api-graph.py --fail-on error

# Consumidores afetados pelas mudancas: make ai-api-impact [BASE=origin/main]; sem BASE usa o diff nao commitado.
ai-api-impact:
	python3 tools/ai/api-graph.py --impact-diff $(BASE)

# Recorte da superficie HTTP para preflight de agent: make ai-api-context MODULE=kanban (modulo ou id de servico).
ai-api-context:
	python3 tools/ai/api-graph.py --slice "$(MODULE)"

# Grafo arquitetural transversal (contracts + governance + subgrafo HTTP).
ai-architecture-graph:
	python3 tools/ai/architecture-graph.py --fail-on $(if $(FAIL_ON),$(FAIL_ON),none)

ai-architecture-graph-gate:
	python3 tools/ai/architecture-graph.py --fail-on error

ai-architecture-context:
	python3 tools/ai/architecture-graph.py --context "$(NODE)" --depth $(if $(DEPTH),$(DEPTH),2) --limit $(if $(LIMIT),$(LIMIT),200) --format $(if $(FORMAT),$(FORMAT),text)

ai-architecture-impact:
	python3 tools/ai/architecture-graph.py --impact "$(NODE)" --depth $(if $(DEPTH),$(DEPTH),2) --limit $(if $(LIMIT),$(LIMIT),200) --format $(if $(FORMAT),$(FORMAT),text)

# Viewer local read-only; Vite permanece em loopback por configuracao.
ai-architecture-graph-viewer:
	PORT=$(if $(PORT),$(PORT),4174) tools/ai/run-architecture-graph-viewer.sh

ai-report:
	tools/ai/governance-report.sh

contract-tests:
	docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-identity-admin && npm test'
	docker compose exec -T jboot bash -lc 'cd implementations/site-jboot-landing && npm test'

ai-record-sample:
	tools/ai/record-execution.sh --title "sample ai governance execution" --project implementations/bff-jboot-platform --module modules/pdv --mode governance --status success --agents "docs/agents/orchestration/product-engineer.md" --skills ".codex.d/skills/jboot-orchestration/SKILL.md" --validations "make ai-check" --output "sample record"

ai-check: ai-runtime-check ai-contract-check ai-preflight-sample ai-evals ai-conformance ai-api-graph-gate ai-architecture-graph-gate
