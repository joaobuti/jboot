#!/usr/bin/env python3
"""Deterministic behavioral and regression evals for AI engineering controls."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile

import yaml


ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "docs/ai-governance/evals/scenarios.yaml"


def load_governance():
    path = ROOT / "tools/ai/governance.py"
    spec = importlib.util.spec_from_file_location("jboot_governance", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def run_api_graph(client_path: str, arguments: list[str], accepted: list[dict] | None = None) -> subprocess.CompletedProcess:
    """Run tools/ai/api-graph.py on a two-module provider/consumer fixture in a temporary directory."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        config = {
            "services": {"api": {"framework": "nestjs", "root": "api", "sources": ["src"], "base_env": ["ITEMS_API_URL"]}},
            "consumers": {"web": {"language": "typescript", "root": "web", "sources": ["src"]}},
        }
        files = {
            "api/src/modules/items/items.controller.ts": "@Controller('items')\nexport class ItemsController {\n  @Get()\n  list() {}\n}\n",
            "api/src/modules/orders/orders.controller.ts": "@Controller('orders')\nexport class OrdersController {\n  @Get()\n  list() {}\n}\n",
            "web/src/modules/items/api.ts": (
                "const API = process.env.ITEMS_API_URL;\n"
                "export const list = () => fetch(`${API}/items`);\n"
                "export const orders = () => fetch(`${API}/orders`);\n"
                "export const other = () => fetch(`${API}" + client_path + "`);\n"
            ),
        }
        if accepted is not None:
            config["accepted_findings"] = "accepted.yaml"
            files["accepted.yaml"] = yaml.safe_dump({"accepted": accepted})
        files["api-graph.yaml"] = yaml.safe_dump(config)
        for relative, content in files.items():
            (root / relative).parent.mkdir(parents=True, exist_ok=True)
            (root / relative).write_text(content, encoding="utf-8")
        command = [
            sys.executable, str(ROOT / "tools/ai/api-graph.py"), "--root", directory,
            "--config", "api-graph.yaml", "--output", "out.json", *arguments,
        ]
        return subprocess.run(command, cwd=ROOT, capture_output=True, text=True)


def run_architecture_graph(unregistered: bool = False) -> subprocess.CompletedProcess:
    """Run the architecture gate against a minimal isolated repository fixture."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        files = {
            "docs/architecture-graph/registry.yaml": (
                'schema_version: "1.0.0"\n'
                "nodes:\n"
                "  - id: repository:jboot\n"
                "    type: repository\n"
                "    label: JBoot\n"
                "    lifecycle: active\n"
                "    owner: architecture\n"
                "    source: docs/ai-architecture.md\n"
                "edges: []\n"
            ),
            "docs/ai-architecture.md": "# Architecture\n",
            "implementations/api/PROJECT_CONTRACT.md": "# API\n\nlifecycle_status: functional\n",
            "tools/ai/api-graph.py": "import json; print(json.dumps({'services': [], 'routes': [], 'calls': []}))\n",
        }
        if unregistered:
            files["implementations/orphan/src/main.ts"] = "export {};\n"
        for relative, content in files.items():
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        return subprocess.run([
            sys.executable, str(ROOT / "tools/ai/architecture-graph.py"),
            "--root", directory, "--fail-on", "error",
        ], cwd=ROOT, capture_output=True, text=True)


API_GRAPH_ACCEPTED_ORPHAN = {
    "kind": "orphan_call", "category": "planned", "file": "web/src/modules/items/api.ts",
    "method": "GET", "path": "/missing", "reason": "eval fixture",
}


def api_context_slice_is_scoped(result: subprocess.CompletedProcess) -> bool:
    if result.returncode != 0:
        return False
    document = yaml.safe_load(result.stdout)
    provided = {(route["method"], route["path"]) for route in document["routes"]}
    outbound = {(edge["module"], edge["path"]) for edge in document["outbound"]}
    return provided == {("GET", "/items")} and outbound == {("orders", "/orders")}


def run_go_api_graph(drift: bool = False) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        config = {
            "services": {
                "payments": {
                    "framework": "go-net-http", "root": "payments", "sources": ["internal"],
                    "openapi": "payments.yaml", "base_env": ["PAYMENTS_URL"],
                },
            },
            "consumers": {
                "go-client": {"language": "go", "root": "client", "sources": ["."]},
            },
        }
        files = {
            "api-graph.yaml": yaml.safe_dump(config),
            "payments/internal/router.go": (
                'package api\nimport "net/http"\nfunc routes(m *http.ServeMux) {\n'
                '  m.HandleFunc("POST /v1/charges", createCharge)\n}\n'
            ),
            "client/client.go": (
                'package client\nimport ("context"; "net/http"; "os")\n'
                'func create(ctx context.Context) {\n'
                '  base := os.Getenv("PAYMENTS_URL")\n'
                '  http.NewRequestWithContext(ctx, http.MethodPost, base + "/v1/charges", nil)\n}\n'
            ),
            "payments.yaml": (
                "openapi: 3.1.0\npaths:\n"
                "  /v1/charges:\n    post:\n      operationId: createCharge\n"
                "      responses:\n        '201': {description: created}\n"
                + ("  /v1/missing:\n    get:\n      responses:\n        '200': {description: missing}\n" if drift else "")
            ),
        }
        for relative, content in files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        return subprocess.run(
            [
                sys.executable, str(ROOT / "tools/ai/api-graph.py"), "--root", directory,
                "--config", "api-graph.yaml", "--output", "out.json", "--fail-on", "error",
            ],
            cwd=ROOT, capture_output=True, text=True,
        )


def run_assertion(name: str, scenario: dict, governance) -> bool:
    if name == "api_graph_gate_rejects_unaccepted_orphan_call":
        return run_api_graph("/missing", ["--fail-on", "error"]).returncode == 1
    if name == "api_graph_gate_accepts_declared_finding":
        return run_api_graph("/missing", ["--fail-on", "error"], [API_GRAPH_ACCEPTED_ORPHAN]).returncode == 0
    if name == "api_graph_gate_rejects_stale_accepted_finding":
        return run_api_graph("/items", ["--fail-on", "error"], [API_GRAPH_ACCEPTED_ORPHAN]).returncode == 1
    if name == "api_context_slice_is_scoped_to_module":
        return api_context_slice_is_scoped(run_api_graph("/items", ["--slice", "items", "--format", "json"]))
    if name == "api_context_rejects_unknown_slice":
        return run_api_graph("/items", ["--slice", "does-not-exist"]).returncode == 2
    if name == "api_graph_covers_go_provider_consumer_and_openapi":
        result = run_go_api_graph()
        if result.returncode != 0:
            return False
        return "1 routes" in result.stdout and "1 calls" in result.stdout and "0 error" in result.stdout
    if name == "api_graph_rejects_go_openapi_drift":
        result = run_go_api_graph(drift=True)
        return result.returncode == 1 and "provider_contract_drift" in result.stdout
    if name == "architecture_graph_gate_accepts_registered_implementation":
        return run_architecture_graph().returncode == 0
    if name == "architecture_graph_gate_rejects_unregistered_implementation":
        result = run_architecture_graph(unregistered=True)
        return result.returncode == 1 and "implementation_without_contract" in result.stdout
    if name == "architecture_graph_rule_is_adapter_covered":
        targets = {
            "AGENTS.md": "Graph Engineering transversal e obrigatorio",
            ".claude/CLAUDE.md": "Graph Engineering transversal e obrigatorio",
            ".codex.d/AGENTS.md": "Graph Engineering transversal e obrigatorio",
            ".cursor/rules/jboot-ai-architecture.mdc": "Transversal Graph Engineering is mandatory",
            ".github/copilot-instructions.md": "Transversal Graph Engineering is mandatory",
            "docs/agents/orchestration/product-engineer.md": "make ai-architecture-graph-gate",
            "docs/agents/orchestration/architect.md": "make ai-architecture-graph-gate",
            "docs/AI-COMMANDS.md": "make ai-architecture-graph-gate",
            "docs/ai-commands/jboot-plan-feature.md": "make ai-architecture-context",
            "docs/ai-commands/jboot-implement-feature.md": "make ai-architecture-graph-gate",
            "docs/ai-commands/jboot-new-module.md": "make ai-architecture-graph-gate",
        }
        makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
        return all(
            marker in (ROOT / target).read_text(encoding="utf-8")
            for target, marker in targets.items()
        ) and "ai-architecture-graph-gate" in makefile.split("ai-check:", 1)[1].splitlines()[0]
    if name == "graph_steward_routing_is_defined":
        steward = (ROOT / "docs/agents/orchestration/ai-graph-architect.md").read_text(encoding="utf-8")
        routing_targets = {
            "docs/agents/orchestration/README.md": "## Roteamento Do AI Graph Architect",
            "docs/agents/orchestration/product-engineer.md": "graph_steward_required",
            "docs/agents/orchestration/architect.md": "graph_steward_trigger",
            "docs/agents/orchestration/product-owner.md": "graph_steward_candidate",
            "docs/agents/orchestration/ui-ux.md": "ai-graph-architect",
            ".claude/agents/ai-graph-architect.md": "Graph Steward Decision",
        }
        adapters = {
            "AGENTS.md": "ai-graph-architect.md",
            ".claude/CLAUDE.md": "ai-graph-architect.md",
            ".codex.d/AGENTS.md": "ai-graph-architect.md",
            ".cursor/rules/jboot-ai-architecture.mdc": "ai-graph-architect.md",
            ".github/copilot-instructions.md": "ai-graph-architect.md",
        }
        registry = (ROOT / "docs/architecture-graph/registry.yaml").read_text(encoding="utf-8")
        return (
            all(marker in steward for marker in ("## Quando Acionar", "## Quando Nao Acionar", "## Matriz De Handoff", "Graph Steward Decision"))
            and all(marker in (ROOT / target).read_text(encoding="utf-8") for target, marker in routing_targets.items())
            and all(marker in (ROOT / target).read_text(encoding="utf-8") for target, marker in adapters.items())
            and "agent:docs/agents/orchestration/ai-graph-architect" in registry
            and "type: governed_by" in registry
        )
    if name == "graph_steward_cannot_replace_executor_updates":
        targets = [
            "AGENTS.md",
            "docs/agents/orchestration/ai-graph-architect.md",
            "docs/agents/orchestration/README.md",
            ".claude/CLAUDE.md",
            ".codex.d/AGENTS.md",
            ".cursor/rules/jboot-ai-architecture.mdc",
            ".github/copilot-instructions.md",
        ]
        required_alternatives = (
            ("executor", "mesmo diff"),
            ("executor", "same diff"),
        )
        return all(
            any(all(marker in text for marker in alternative) for alternative in required_alternatives)
            and ("nao e o unico editor" in text or "nunca e o unico editor" in text or "nao e editor exclusivo" in text or "not the exclusive editor" in text or "nunca assume escrita exclusiva" in text)
            for target in targets
            for text in [(ROOT / target).read_text(encoding="utf-8")]
        )
    if name == "api_contract_graph_rule_is_adapter_covered":
        targets = {
            "AGENTS.md": "grafo de contratos HTTP",
            ".claude/CLAUDE.md": "grafo de contratos HTTP",
            ".codex.d/AGENTS.md": "grafo de contratos HTTP",
            ".cursor/rules/jboot-ai-architecture.mdc": "HTTP contract graph",
            ".github/copilot-instructions.md": "HTTP contract graph",
            "docs/ai-commands/jboot-implement-feature.md": "make ai-api-graph-gate",
            "docs/agents/orchestration/product-engineer.md": "make ai-api-graph-gate",
        }
        return all(
            marker in (text := (ROOT / target).read_text(encoding="utf-8"))
            and "make ai-api-impact" in text
            and "make ai-api-context" in text
            for target, marker in targets.items()
        ) and "ai-api-graph-gate" in (ROOT / "Makefile").read_text(encoding="utf-8").split("ai-check:", 1)[1].splitlines()[0]
    if name == "preflight_rejects_activation_without_skill":
        command = [
            "tools/ai/preflight-check.sh",
            "--project", "implementations/bff-jboot-platform",
            "--module", "modules/pdv",
            "--gate", "docs/product/pdv-sprint-1-gate.md",
            "--activation-file", "docs/ai-governance/evals/invalid-agent-activation-missing-skill.txt",
        ]
        return subprocess.run(command, cwd=ROOT, stdout=subprocess.DEVNULL).returncode != 0
    if name == "frontend_contract_requires_document_lookup":
        return scenario["expected_text"] in (ROOT / scenario["target"]).read_text(encoding="utf-8")
    if name == "stale_context_is_rejected":
        output, expected = next(iter(governance.context_outputs().items()))
        return output.read_text(encoding="utf-8") != expected + "\npoisoned"
    if name == "module_without_lifecycle_is_rejected":
        return governance.extract_scalar("# Contract\n", "lifecycle_status") is None
    if name == "adapter_missing_control_is_rejected":
        profile = governance.load_yaml(governance.PROFILE)
        controls = [item["id"] for item in profile["required_controls"] if item["blocking"]]
        return any(control not in "Agent Activation" for control in controls)
    if name == "unavailable_measurement_cannot_be_encoded_as_measured_zero":
        command = [
            "tools/ai/record-execution.sh",
            "--title", "invalid-measurement-eval",
            "--project", "repository-root",
            "--measurement-status", "not_collected",
            "--prompt-tokens", "0",
        ]
        return subprocess.run(command, cwd=ROOT, stdout=subprocess.DEVNULL).returncode != 0
    if name == "untrusted_content_cannot_override_instruction_hierarchy":
        return scenario["expected_text"] in (ROOT / scenario["target"]).read_text(encoding="utf-8")
    if name == "runtime_permissions_do_not_expose_session_tokens":
        settings = (ROOT / scenario["target"]).read_text(encoding="utf-8")
        return "accessToken" not in settings and '"allow": []' in settings
    if name == "engineering_harness_is_canonical":
        return scenario["expected_text"] in (ROOT / scenario["target"]).read_text(encoding="utf-8")
    if name == "mcp_cannot_replace_engineering_harness":
        text = (ROOT / scenario["target"]).read_text(encoding="utf-8")
        return scenario["expected_text"] in text and scenario["forbidden_text"] not in text
    if name == "ui_ux_and_stack_agents_are_adapter_covered":
        required = ["docs/agents/orchestration/ui-ux.md", "docs/agents/stacks/*"]
        targets = [
            ".codex.d/AGENTS.md",
            ".claude/CLAUDE.md",
            ".cursor/rules/jboot-ai-architecture.mdc",
            ".github/copilot-instructions.md",
        ]
        return all(
            all(item in (ROOT / target).read_text(encoding="utf-8") for item in required)
            for target in targets
        ) and (ROOT / ".claude/agents/ui-ux.md").is_file()
    if name == "backend_and_frontend_are_a_single_delivery_flow":
        # A regressao real nao e a fonte canonica perder a regra, e sim os
        # adapters ficarem para tras: cada runtime de IA le o seu, entao uma
        # regra so presente em AGENTS.md nao governa Codex, Cursor ou Copilot.
        adapters = {
            ".claude/CLAUDE.md": "fluxo unico",
            ".codex.d/AGENTS.md": "fluxo unico de entrega",
            ".cursor/rules/jboot-ai-architecture.mdc": "one delivery flow",
            ".github/copilot-instructions.md": "one delivery flow",
        }
        canonical = scenario["expected_text"] in (ROOT / scenario["target"]).read_text(encoding="utf-8")
        return canonical and all(
            marker in (ROOT / target).read_text(encoding="utf-8")
            for target, marker in adapters.items()
        )
    if name == "implementation_mapping_triggers_formal_pe_gate":
        required_markers = ["PE Decision", "Stack Fit Gate", "sprint_artifact", "sprint_gate", "open_questions", "blocking_status"]
        canonical_targets = {
            "AGENTS.md": "mapear implementacao",
            "docs/agents/orchestration/product-engineer.md": "mapear implementacao",
            "docs/AI-COMMANDS.md": "mapear implementacao",
            "docs/ai-commands/jboot-plan-feature.md": "mapeamento de implementacao",
        }
        adapters = [
            ".codex.d/AGENTS.md",
            ".claude/CLAUDE.md",
            ".cursor/rules/jboot-ai-architecture.mdc",
            ".github/copilot-instructions.md",
        ]
        canonical = all(
            mapping_marker in (text := (ROOT / target).read_text(encoding="utf-8"))
            and all(marker in text for marker in required_markers)
            for target, mapping_marker in canonical_targets.items()
        )
        adapter_covered = all(
            "PE Decision" in (text := (ROOT / target).read_text(encoding="utf-8"))
            and ("implementacao" in text or "implementation" in text)
            for target in adapters
        )
        return canonical and adapter_covered
    if name == "confirmed_payments_stack_remains_go":
        adr = (ROOT / "docs/architecture/decisions/011-payments-service-go.md").read_text(encoding="utf-8")
        roadmap = (ROOT / "docs/product/payments-sprints.md").read_text(encoding="utf-8")
        required_adr = [
            "human_confirmation: confirmed",
            "recommended_stack: Go + PostgreSQL",
            "decision_status: confirmed_by_human",
            "Java/Spring + PostgreSQL",
            "Rejeitada para este servico",
        ]
        required_roadmap = [
            "backend_language: Go",
            "stack_status: confirmed_by_human",
            "Go e uma decisao aceita, nao uma pergunta aberta",
        ]
        forbidden = [
            "recommended_stack: Java",
            "recommended_stack: Spring",
            "backend_language: Java",
        ]
        return (
            all(marker in adr for marker in required_adr)
            and all(marker in roadmap for marker in required_roadmap)
            and all(marker not in adr and marker not in roadmap for marker in forbidden)
        )
    if name == "payments_pilot_decisions_are_persisted":
        provider_adr = (ROOT / "docs/architecture/decisions/012-infinitepay-pilot.md").read_text(encoding="utf-8")
        roadmap = (ROOT / "docs/product/payments-sprints.md").read_text(encoding="utf-8")
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        required_provider = [
            "first_provider: infinitepay",
            "account_model: byoa_per_tenant",
            "fund_flow: provider_direct_to_tenant",
            "poc_capability: checkout_pix",
            "poc_capability_status: confirmed_by_human",
        ]
        required_roadmap = [
            "first_consumer: pdv",
            "first_provider: infinitepay",
            "commercial_billing_cycle: next_subscription_cycle",
            "commercial_block_mode: new_charges_only",
        ]
        required_gate = [
            "project_materialization: authorized_and_materialized",
            "PAY-S0-001",
            "PAY-S0-003",
            "PAY-S0-005",
        ]
        return (
            all(marker in provider_adr for marker in required_provider)
            and all(marker in roadmap for marker in required_roadmap)
            and all(marker in gate for marker in required_gate)
        )
    if name == "payments_byoa_rejects_jboot_custody":
        targets = [
            ROOT / "docs/architecture/decisions/012-infinitepay-pilot.md",
            ROOT / "docs/product/payments-sprints.md",
        ]
        forbidden = [
            "jboot_custody_of_funds: true",
            "provider_model: jboot_master_account",
            "fund_flow: provider_to_jboot_to_tenant",
        ]
        return all(
            all(marker not in target.read_text(encoding="utf-8") for marker in forbidden)
            for target in targets
        )
    if name == "payments_received_requires_positive_provider_check":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        adr = (ROOT / "docs/architecture/decisions/012-infinitepay-pilot.md").read_text(encoding="utf-8")
        required_gate = [
            "Payment Check Positivo",
            "`success=true`",
            "`paid=true`",
            "`capture_method=pix`",
            "valor integral esperado",
            "provider do tenant correto",
        ]
        required_adr = [
            "No caminho positivo Checkout Pix comprovado",
            "`success=true`",
            "`paid=true`",
            "`capture_method=pix`",
            "valor integral esperado",
            "conta provider do tenant",
        ]
        return all(marker in gate for marker in required_gate) and all(
            marker in adr for marker in required_adr
        )
    if name == "payments_callback_cannot_confirm_received":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        adr = (ROOT / "docs/architecture/decisions/012-infinitepay-pilot.md").read_text(encoding="utf-8")
        required_gate = [
            "nao confirma pagamento por",
            "nao confiavel",
            "nao autorizam `received`",
        ]
        required_adr = [
            "`received` isoladamente",
            "participam da decisao automatica",
        ]
        return all(marker in gate for marker in required_gate) and all(
            marker in adr for marker in required_adr
        )
    if name == "payments_byoa_change_requires_revalidation":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        adr = (ROOT / "docs/architecture/decisions/012-infinitepay-pilot.md").read_text(encoding="utf-8")
        common_markers = [
            "somente administrador autorizado",
            "audit",
            "revalidacao",
        ]
        return (
            all(marker in gate and marker in adr for marker in common_markers)
            and "toda troca" in gate
            and "Toda troca" in adr
        )
    if name == "payments_unverified_connection_blocks_new_charges":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        adr = (ROOT / "docs/architecture/decisions/012-infinitepay-pilot.md").read_text(encoding="utf-8")
        required_gate = ["`unverified`", "bloqueia novas cobrancas"]
        required_adr = ["`unverified`", "bloqueia novas cobrancas"]
        forbidden = ["conexao `unverified` permite novas cobrancas"]
        return (
            all(marker in gate for marker in required_gate)
            and all(marker in adr for marker in required_adr)
            and all(marker not in gate and marker not in adr for marker in forbidden)
        )
    if name == "payments_unknown_capacity_is_explicitly_not_collected":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        roadmap = (ROOT / "docs/product/payments-sprints.md").read_text(encoding="utf-8")
        required_gate = [
            "status: not_collected",
            "customers: null",
            "peak_new_charges_per_minute: null",
            "benchmark reproduzivel",
            "gate de producao",
        ]
        required_roadmap = [
            "capacity_forecast_status: not_collected",
            "measure_before_production_never_encode_unknown_as_zero",
        ]
        return all(marker in gate for marker in required_gate) and all(
            marker in roadmap for marker in required_roadmap
        )
    if name == "payments_unknown_capacity_is_never_encoded_as_zero":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        roadmap = (ROOT / "docs/product/payments-sprints.md").read_text(encoding="utf-8")
        forbidden = [
            "customers: 0",
            "charges_per_customer_month: 0",
            "peak_new_charges_per_minute: 0",
            "average_ticket: 0",
            "capacity_forecast_status: measured_zero",
        ]
        return all(marker not in gate and marker not in roadmap for marker in forbidden)
    if name == "payments_provider_polling_is_bounded_and_reconcilable":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        required = [
            "timeout HTTP total inicial de 5 segundos",
            "retries de `payment_check` usam jitter e backoff",
            "`pending_reconciliation`",
            "apos 24 horas",
            "nao inferir `failed` nem `expired`",
            "nenhum limite da InfinitePay e inventado",
        ]
        return all(marker in gate for marker in required)
    if name == "payments_creation_timeout_never_blindly_retries":
        gate = (ROOT / "docs/product/payments-sprint-0-gate.md").read_text(encoding="utf-8")
        review = (ROOT / "docs/product/payments-sprint-0-final-review.md").read_text(encoding="utf-8")
        return (
            "`creation_outcome_unknown`" in gate
            and "nao repetir" in gate
            and "resultado externo incerto preservado sem duplicacao" in review
            and "retry cego na criacao" not in gate
            and "retry cego na criacao" not in review
        )
    if name == "payments_foundation_enforces_tenant_idempotency_and_outbox":
        migration = (
            ROOT
            / "implementations/svc-jboot-payments/internal/adapters/postgres/migrations/001_foundation.sql"
        ).read_text(encoding="utf-8")
        repository = (
            ROOT / "implementations/svc-jboot-payments/internal/adapters/postgres/repository.go"
        ).read_text(encoding="utf-8")
        repository_test = (
            ROOT / "implementations/svc-jboot-payments/internal/adapters/postgres/repository_test.go"
        ).read_text(encoding="utf-8")
        required_migration = [
            "UNIQUE (client_id, consumer_application, idempotency_key)",
            "FOREIGN KEY (client_id, charge_id)",
            "CREATE TABLE IF NOT EXISTS outbox_events",
        ]
        required_repository = [
            "INSERT INTO outbox_events",
            "ON CONFLICT (client_id, consumer_application, idempotency_key) DO NOTHING",
        ]
        required_tests = [
            "TestRepositoryIdempotencyAndTenantIsolation",
            "TestRepositoryConcurrentIdempotencyCreatesOneCharge",
        ]
        return (
            all(marker in migration for marker in required_migration)
            and all(marker in repository for marker in required_repository)
            and all(marker in repository_test for marker in required_tests)
        )
    if name == "payments_foundation_cannot_claim_production_readiness":
        contract = (
            ROOT / "implementations/svc-jboot-payments/PROJECT_CONTRACT.md"
        ).read_text(encoding="utf-8")
        roadmap = (ROOT / "docs/product/payments-sprints.md").read_text(encoding="utf-8")
        required_contract = [
            "lifecycle_status: in_progress",
            "production_readiness: blocked",
            "webhook InfinitePay real",
            "grafo HTTP canonico",
        ]
        forbidden = [
            "lifecycle_status: production_ready",
            "production_readiness: ready",
            "adapter InfinitePay production-ready",
        ]
        return (
            all(marker in contract for marker in required_contract)
            and "Sprint 2: InfinitePay Checkout Pix PoC" in roadmap
            and all(marker not in contract for marker in forbidden)
        )
    if name == "external_api_fixtures_come_from_real_responses":
        # Cada runtime le o proprio adapter; a skill DataJud e onde o erro
        # original nasceu, entao precisa carregar a mesma restricao.
        targets = {
            ".claude/CLAUDE.md": "resposta real capturada",
            ".codex.d/AGENTS.md": "resposta real capturada",
            ".cursor/rules/jboot-ai-architecture.mdc": "real response captured",
            ".github/copilot-instructions.md": "real response captured",
            "implementations/svc-jboot-juridico-data/skills/datajud-contract.md": "resposta real capturada",
        }
        canonical = scenario["expected_text"] in (ROOT / scenario["target"]).read_text(encoding="utf-8")
        return canonical and all(
            marker in (ROOT / target).read_text(encoding="utf-8")
            for target, marker in targets.items()
        )
    if name == "independent_unit_stack_gate_has_no_repository_baseline_preference":
        canonical_targets = {
            "AGENTS.md": ["Deployment Boundary Gate", "unidade independente de build/runtime/deploy/operacao", "nao recebe preferencia"],
            "docs/agents/orchestration/product-engineer.md": ["independent_unit", "greenfield", "counterfactual_choice", "nao bastam"],
            "docs/agents/orchestration/architect.md": ["independent_unit", "greenfield", "counterfactual_choice", "nao recebe preferencia"],
        }
        adapters = {
            ".claude/CLAUDE.md": ["Deployment Boundary Gate", "Unidade independente", "nao recebe preferencia"],
            ".codex.d/AGENTS.md": ["Deployment Boundary Gate", "Unidade independente", "nao recebe preferencia"],
            ".cursor/rules/jboot-ai-architecture.mdc": ["Deployment Boundary Gate", "independent unit", "no automatic preference"],
            ".github/copilot-instructions.md": ["Deployment Boundary Gate", "independent unit", "no automatic preference"],
        }
        return all(
            all(marker in (text := (ROOT / target).read_text(encoding="utf-8")) for marker in markers)
            for target, markers in canonical_targets.items()
        ) and all(
            all(marker in (text := (ROOT / target).read_text(encoding="utf-8")) for marker in markers)
            for target, markers in adapters.items()
        )
    if name == "embedded_module_inherits_host_stack":
        targets = {
            "AGENTS.md": "deve herdar a stack",
            "docs/agents/orchestration/product-engineer.md": "stack_decision: inherited_from_host",
            "docs/agents/orchestration/architect.md": "inherited_from_host",
            ".claude/CLAUDE.md": "herda a stack",
            ".codex.d/AGENTS.md": "herda a stack",
            ".cursor/rules/jboot-ai-architecture.mdc": "inherits the host stack",
            ".github/copilot-instructions.md": "inherits the host stack",
        }
        return all(
            marker in (ROOT / target).read_text(encoding="utf-8")
            for target, marker in targets.items()
        )
    raise ValueError(f"unknown assertion: {name}")


def main() -> int:
    document = yaml.safe_load(SCENARIOS.read_text(encoding="utf-8"))
    governance = load_governance()
    failed: list[str] = []
    seen: set[str] = set()
    for scenario in document.get("scenarios", []):
        scenario_id = scenario.get("id")
        if not scenario_id or scenario_id in seen:
            failed.append(f"invalid or duplicate scenario id: {scenario_id}")
            continue
        seen.add(scenario_id)
        try:
            passed = run_assertion(scenario["assertion"], scenario, governance)
        except Exception as exc:  # eval harness must fail closed
            failed.append(f"{scenario_id}: {exc}")
            continue
        if not passed and scenario.get("blocking", True):
            failed.append(f"{scenario_id}: assertion failed")
    if failed:
        for item in failed:
            print(f"fail: {item}")
        return 1
    print(f"AI behavioral evals ok; scenarios={len(seen)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
