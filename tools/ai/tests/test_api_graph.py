from __future__ import annotations

import importlib.util
import io
import json
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
import sys
import tempfile
import textwrap
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[3]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    # dataclasses resolve string annotations through sys.modules on Python 3.10.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


api_graph = load_module("jboot_api_graph_test", ROOT / "tools/ai/api-graph.py")


FIXTURE = {
    "api-graph.yaml": """
        schema_version: "1.0.0"
        services:
          shop:
            framework: nestjs
            root: shop
            sources: [src]
            base_env: [NEXT_PUBLIC_SHOP_API_URL, SHOP_API_URL]
          fiscal:
            framework: laravel
            root: fiscal
            sources: [routes]
            base_env: [FISCAL_URL]
          worker:
            framework: fastapi
            root: worker
            sources: [src]
            base_env: [WORKER_URL]
          identity:
            framework: nestjs
            root: identity
            sources: [src]
            base_env: [IDENTITY_URL]
            full_url_env: [JWKS_URL]
          web:
            framework: nextjs
            root: web
            sources: [src]
        consumers:
          web:
            language: typescript
            root: web
            sources: [src]
          shop:
            language: typescript
            root: shop
            sources: [src]
          worker:
            language: python
            root: worker
            sources: [src]
          fiscal:
            language: php
            root: fiscal
            sources: [app]
        external_env: [META_URL, DATA_DJEN_BASE_URL]
        exclude: ["**/*.spec.ts"]
    """,
    "shop/src/eproc.service.ts": """
        export class EprocService {
          constructor(private readonly config: AppConfig) {}

          async stop(id: string) {
            return this.workerPost(
              `/monitors/${id}/stop`,
              {},
            );
          }

          async list() {
            return this.workerGet('/monitors');
          }

          private async workerGet(path: string): Promise<unknown> {
            const url = `${this.config.workerUrl}${path}`;
            const resp = await fetch(url);
            return resp.json();
          }

          private async workerPost(path: string, body: unknown): Promise<unknown> {
            const url = `${this.config.workerUrl}${path}`;
            const resp = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
            return resp.json();
          }
        }
    """,
    "shop/src/meta.client.ts": """
        export class MetaClient {
          constructor(private readonly config: AppConfig) {}

          private get graphUrl(): string {
            return `${this.config.meta.graphBaseUrl}/v21.0`;
          }

          async me() {
            const url = new URL(`${this.config.meta.graphBaseUrl}/me`);
            return fetch(url.toString());
          }

          async media(id: string) {
            return fetch(`${this.graphUrl}/${id}/media`, { method: 'POST' });
          }
        }
    """,
    "web/src/app/api/session/route.ts": """
        export async function GET() {
          return Response.json({});
        }
    """,
    "web/src/slices/auth.ts": """
        export async function login(payload: unknown) {
          await fetch("/api/session");
          return fetch("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
        }
    """,
    "worker/src/settings.py": """
        from pydantic_settings import BaseSettings, SettingsConfigDict


        class Settings(BaseSettings):
            model_config = SettingsConfigDict(env_prefix="DATA_", extra="ignore")
            djen_base_url: str = "https://comunica.example"
    """,
    "worker/src/djen.py": """
        class DjenClient:
            def __init__(self, client, settings):
                self._client = client
                self._settings = settings

            async def page(self, path: str):
                return await self._client.get(f"{self._settings.djen_base_url}{path}", timeout=5)
    """,
    "shop/src/items.controller.ts": """
        @Controller('shop/items')
        export class ItemsController {
          constructor(private readonly service: ItemsService) {}

          @Get()
          list(@Query() query: ListDto): Promise<ItemDto[]> {
            return this.service.list(query);
          }

          @Get(':id')
          @UseGuards(AuthGuard)
          get(@Param('id') id: string) {
            return this.service.get(id);
          }

          @Post()
          create(@Body() dto: CreateItemDto): Promise<ItemDto> {
            return this.service.create(dto);
          }

          // @Delete(':id')
          @Patch(':id/status')
          status(@Param('id') id: string) {}
        }
    """,
    "shop/src/items.controller.spec.ts": """
        @Controller('spec/only')
        export class SpecController {
          @Get()
          ignored() {}
        }
    """,
    "shop/src/config.ts": """
        export class AppConfig {
          readonly fiscalServiceUrl = process.env.FISCAL_URL ?? 'http://localhost:8090';
          readonly workerUrl =
            process.env.WORKER_URL ?? 'http://localhost:8020';
          readonly meta = {
            graphBaseUrl: process.env.META_URL ?? 'https://graph.example.com',
          };
        }
    """,
    "shop/src/fiscal.service.ts": """
        export class FiscalService {
          constructor(private readonly config: AppConfig) {}

          async cancel(id: string) {
            const url = `${this.config.fiscalServiceUrl}/api/v1/documentos/${id}/cancelamento`;
            const response = await fetch(url, { method: 'POST' });
            return response.ok;
          }

          async upsert() {
            return this.call(`${this.config.fiscalServiceUrl}/api/v1/config`);
          }

          async monitor(start: boolean, id: string) {
            const endpoint = start ? `${this.config.workerUrl}/monitors` : `${this.config.workerUrl}/monitors/${id}/stop`;
            await fetch(endpoint, { method: 'POST', headers: {} });
          }

          async publish() {
            await fetch(`${process.env.META_URL}/me/media`, { method: 'POST' });
          }

          private async call(url: string): Promise<Response> {
            return fetch(url, { method: 'PUT' });
          }
        }
    """,
    "web/src/lib/api.ts": """
        const API_BASE =
          process.env.NEXT_PUBLIC_SHOP_API_URL ?? "http://127.0.0.1:8010";

        async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
          const response = await fetch(`${API_BASE}${path}`, { ...init, headers: {} });
          return (await response.json()) as T;
        }

        function crud<T>(basePath: string) {
          return {
            remove: (id: string) => request<void>(`${basePath}/${id}`, { method: "DELETE" }),
          };
        }

        export const api = {
          list: (filters: Filters) => request<{ data: ItemDto[]; total: number }>(`/shop/items${toQueryString(filters)}`),
          get: (id: string) => request<ItemDto>(`/shop/items/${id}`),
          create: (payload: unknown) =>
            request<ItemDto>("/shop/items", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
          ghost: () => request<void>("/shop/ghost"),
          wrongMethod: (id: string) => request<void>(`/shop/items/${id}/status`, { method: "PUT" }),
          dynamic: () => request<void>(buildPath()),
          crossService: () => request<void>("/api/v1/config", { method: "PUT" }),
          items: crud<ItemDto>("/shop/items"),
          // commented: () => request<void>("/shop/commented"),
        };

        const pattern = /https?:\\/\\//;
    """,
    "fiscal/bootstrap/app.php": """
        <?php
        return Application::configure(basePath: dirname(__DIR__))
            ->withRouting(
                api: __DIR__.'/../routes/api.php',
                apiPrefix: 'api',
            );
    """,
    "fiscal/routes/api.php": """
        <?php
        Route::get('/health', HealthController::class);

        Route::middleware(['validate.service.jwt'])->prefix('v1')->group(function () {
            Route::post('/documentos/{id}/cancelamento', [DocumentoController::class, 'cancelamento']);
            Route::put('/config', [ConfigController::class, 'upsert']);
        });
    """,
    "fiscal/config/fiscal.php": """
        <?php
        return [
            'identity_jwks_url' => env('JWKS_URL'),
        ];
    """,
    "fiscal/app/Http/Middleware/ValidateServiceJwt.php": """
        <?php
        class ValidateServiceJwt {
            private function keys() {
                $url = config('fiscal.identity_jwks_url');
                $response = Http::timeout(5)->get($url);
                return $response->json();
            }
        }
    """,
    "worker/src/monitoring_api.py": """
        from fastapi import APIRouter

        router = APIRouter(prefix="/monitors")


        @router.post("")
        async def start():
            return {}


        @router.post(
            "/{monitor_id}/stop"
        )
        async def stop(monitor_id: str):
            return {}
    """,
    "worker/src/main.py": """
        from fastapi import FastAPI
        from .monitoring_api import router as monitoring_router

        app = FastAPI()
        app.include_router(monitoring_router)
    """,
    "worker/src/client.py": """
        import os
        import httpx

        PLATFORM = os.getenv("SHOP_API_URL", "http://127.0.0.1:8010")


        async def run(item_id: str, payload: dict):
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(f"{os.getenv('SHOP_API_URL', 'http://x')}/shop/items", json=payload)
                await client.get(f"{PLATFORM}/shop/items/{item_id}")
                # await client.get(f"{PLATFORM}/shop/commented")
            return payload.get("key")
    """,
}


def build_fixture(directory: Path) -> None:
    for relative, content in FIXTURE.items():
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")


def find_call(graph: dict, method: str | None, path: str | None, consumer: str | None = None) -> list[dict]:
    return [
        call for call in graph["calls"]
        if call["method"] == method and call["path"] == path and (consumer is None or call["consumer"] == consumer)
    ]


class ApiGraphPathTests(unittest.TestCase):
    def test_provider_params_normalize_across_frameworks(self):
        self.assertEqual([("shop", ":param", "status")], api_graph.split_provider_path("shop", ":id/status"))
        self.assertEqual([("api", "v1", ":param")], api_graph.split_provider_path("api", "v1", "{id}"))
        self.assertEqual(
            [("files", ":param"), ("files",)],
            api_graph.split_provider_path("files", "{name?}"),
        )

    def test_query_interpolation_is_dropped_but_segment_interpolation_is_param(self):
        parts = api_graph.ts_string_parts("`/shop/items${toQueryString(filters)}`")
        self.assertEqual((("shop", "items"), None), api_graph.relative_segments(parts))
        parts = api_graph.ts_string_parts("`/shop/items/${id}?expand=${fields}`")
        self.assertEqual((("shop", "items", ":param"), None), api_graph.relative_segments(parts))

    def test_ternary_query_suffix_is_not_mistaken_for_a_segment(self):
        nested = api_graph.ts_string_parts('`/admin/capabilities${slug ? `?applicationSlug=${encodeURIComponent(slug)}` : ""}`')
        self.assertEqual((("admin", "capabilities"), None), api_graph.relative_segments(nested))
        plain = api_graph.ts_string_parts('`/kanban/notifications${unreadOnly ? "?unreadOnly=true" : ""}`')
        self.assertEqual((("kanban", "notifications"), None), api_graph.relative_segments(plain))
        dynamic = api_graph.ts_string_parts("`/files/report${suffix}`")
        self.assertEqual((("files", ":param"), None), api_graph.relative_segments(dynamic))

    def test_leading_runtime_expression_is_unresolved_not_guessed(self):
        segments, reason = api_graph.relative_segments([("expr", "basePath"), ("lit", "/x")])
        self.assertIsNone(segments)
        self.assertIn("runtime expression", reason)

    def test_literal_segment_outranks_param_segment(self):
        literal = api_graph.path_score(("pdv", "cashiers", "current"), ("pdv", "cashiers", "current"))
        param = api_graph.path_score(("pdv", "cashiers", "current"), ("pdv", "cashiers", ":param"))
        self.assertGreater(literal, param)
        self.assertIsNone(api_graph.path_score(("a", "b"), ("a", "c")))

    def test_go_net_http_routes_and_openapi_types_are_reconciled(self):
        source = '''
            package httpapi
            func routes(mux *http.ServeMux, router *Router, auth Auth) {
                mux.HandleFunc("GET /health", router.health)
                mux.Handle("POST /v1/charges", auth.Middleware(http.HandlerFunc(router.createCharge)))
                mux.Handle("GET /v1/charges/{chargeId}", auth.Middleware(http.HandlerFunc(router.getCharge)))
            }
        '''
        findings = []
        implementation = api_graph.go_routes(
            "payments", [("payments/router.go", textwrap.dedent(source))], findings,
        )
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            contract = repo / "payments.yaml"
            contract.write_text(textwrap.dedent('''
                openapi: 3.1.0
                paths:
                  /health:
                    get: {operationId: health, responses: {"200": {description: ok}}}
                  /v1/charges:
                    post:
                      operationId: createCharge
                      requestBody:
                        content:
                          application/json:
                            schema: {$ref: "#/components/schemas/CreateChargeRequest"}
                      responses:
                        "201":
                          description: created
                          content:
                            application/json:
                              schema: {$ref: "#/components/schemas/ChargeResponse"}
                  /v1/charges/{chargeId}:
                    get: {operationId: getCharge, responses: {"200": {description: ok}}}
            ''').lstrip(), encoding="utf-8")
            documented = api_graph.openapi_routes("payments", repo, "payments.yaml", findings)
        routes = api_graph.reconcile_provider_contract("payments", implementation, documented, findings)
        self.assertEqual(
            {"GET /health", "POST /v1/charges", "GET /v1/charges/:param"},
            {f"{route.method} {route.path}" for route in routes},
        )
        create = next(route for route in routes if route.method == "POST")
        self.assertEqual("router.createCharge", create.handler)
        self.assertEqual("CreateChargeRequest", create.request_type)
        self.assertEqual("ChargeResponse", create.response_type)
        self.assertEqual([], findings)

    def test_go_openapi_drift_is_blocking(self):
        implemented = [api_graph.Route("payments", "GET", "/health", ("health",), "router.go", 1, "health", None)]
        documented = [api_graph.Route("payments", "GET", "/ready", ("ready",), "openapi.yaml", 1, "ready", None)]
        findings = []
        api_graph.reconcile_provider_contract("payments", implemented, documented, findings)
        self.assertEqual(2, len(findings))
        self.assertEqual({"provider_contract_drift"}, {finding.kind for finding in findings})
        self.assertEqual({"error"}, {finding.severity for finding in findings})

    def test_go_http_consumers_resolve_environment_bound_routes(self):
        bindings = api_graph.Bindings({
            "services": {"payments": {"base_env": ["PAYMENTS_URL"]}},
            "external_env": [],
        })
        source = '''
            package client
            import ("context"; "fmt"; "net/http"; "os")
            func send(ctx context.Context, id string) {
                baseURL := os.Getenv("PAYMENTS_URL")
                req, _ := http.NewRequestWithContext(ctx, http.MethodPost, baseURL + "/v1/charges", nil)
                _ = req
                _, _ = http.Get(fmt.Sprintf("%s/v1/charges/%s", os.Getenv("PAYMENTS_URL"), id))
            }
        '''
        calls = api_graph.go_extract_calls(
            "go-client", "client/payments.go", textwrap.dedent(source), bindings,
        )
        self.assertEqual(
            [("POST", "/v1/charges"), ("GET", "/v1/charges/:param")],
            [(call.method, call.path) for call in calls],
        )
        self.assertTrue(all(call.status == "resolved" for call in calls))


class ApiGraphFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.repo = Path(cls.tempdir.name)
        build_fixture(cls.repo)
        cls.graph = api_graph.build_graph(cls.repo, Path("api-graph.yaml"))

    @classmethod
    def tearDownClass(cls):
        cls.tempdir.cleanup()

    def route_keys(self, service: str) -> set[str]:
        return {f"{route['method']} {route['path']}" for route in self.graph["routes"] if route["service"] == service}

    def test_routes_are_extracted_per_framework(self):
        self.assertEqual(
            {"GET /shop/items", "GET /shop/items/:param", "POST /shop/items", "PATCH /shop/items/:param/status"},
            self.route_keys("shop"),
        )
        self.assertEqual(
            {"GET /api/health", "POST /api/v1/documentos/:param/cancelamento", "PUT /api/v1/config"},
            self.route_keys("fiscal"),
        )
        self.assertEqual({"POST /monitors", "POST /monitors/:param/stop"}, self.route_keys("worker"))
        self.assertEqual({"GET /api/session"}, self.route_keys("web"))

    def test_nest_route_carries_handler_and_dto_types(self):
        create = next(route for route in self.graph["routes"] if route["method"] == "POST" and route["path"] == "/shop/items")
        self.assertEqual("ItemsController.create", create["handler"])
        self.assertEqual("CreateItemDto", create["request_type"])
        self.assertEqual("ItemDto", create["response_type"])

    def test_frontend_calls_through_discovered_wrapper_match_routes(self):
        for method, path in (("GET", "/shop/items"), ("GET", "/shop/items/:param"), ("POST", "/shop/items")):
            calls = find_call(self.graph, method, path, "web")
            self.assertEqual(1, len(calls), f"{method} {path}")
            self.assertEqual("resolved", calls[0]["status"])
            self.assertEqual("shop", calls[0]["route"]["service"])
        listing = find_call(self.graph, "GET", "/shop/items", "web")[0]
        self.assertEqual("{ data: ItemDto[]; total: number }", listing["response_type"])

    def test_route_lists_its_consumers_for_blast_radius(self):
        detail = next(route for route in self.graph["routes"] if route["method"] == "GET" and route["path"] == "/shop/items/:param")
        consumers = {reference.split(":")[0] for reference in detail["consumers"]}
        self.assertEqual({"web/src/lib/api.ts", "worker/src/client.py"}, consumers)

    def test_orphan_call_is_an_error(self):
        call = find_call(self.graph, "GET", "/shop/ghost")[0]
        self.assertEqual("orphan", call["status"])
        self.assertIn("orphan_call", {finding["kind"] for finding in self.graph["findings"] if finding["severity"] == "error"})

    def test_method_mismatch_reports_available_methods(self):
        mismatch = find_call(self.graph, "PUT", "/shop/items/:param/status")[0]
        self.assertEqual("method_mismatch", mismatch["status"])
        self.assertIn("PATCH", mismatch["reason"])

    def test_factory_prefix_is_instantiated_and_commented_route_is_ignored(self):
        removal = find_call(self.graph, "DELETE", "/shop/items/:param", "web")
        self.assertEqual(1, len(removal))
        self.assertEqual("method_mismatch", removal[0]["status"])

    def test_call_bound_to_wrong_service_is_detected(self):
        call = find_call(self.graph, "PUT", "/api/v1/config", "web")[0]
        self.assertEqual("wrong_service", call["status"])
        self.assertIn("fiscal", call["reason"])

    def test_unresolvable_path_is_warning_not_silently_dropped(self):
        unresolved = [call for call in self.graph["calls"] if call["status"] == "unresolved"]
        self.assertEqual(1, len(unresolved), unresolved)
        self.assertEqual("web", unresolved[0]["consumer"])
        self.assertIn("buildPath()", unresolved[0]["reason"])

    def test_commented_calls_are_not_counted(self):
        paths = {call["path"] for call in self.graph["calls"]}
        self.assertNotIn("/shop/commented", paths)

    def test_s2s_calls_resolve_config_props_consts_ternaries_and_transport_wrappers(self):
        fiscal_service = [call for call in self.graph["calls"] if call["file"] == "shop/src/fiscal.service.ts" and call["status"] == "resolved"]
        self.assertEqual(
            {
                "POST /api/v1/documentos/:param/cancelamento",
                "PUT /api/v1/config",
                "POST /monitors",
                "POST /monitors/:param/stop",
            },
            {f"{call['method']} {call['path']}" for call in fiscal_service},
        )
        self.assertEqual(4, len(fiscal_service))

    def test_wrapper_building_url_in_local_const_is_discovered(self):
        eproc = {
            (call["method"], call["path"], call["status"])
            for call in self.graph["calls"]
            if call["file"] == "shop/src/eproc.service.ts"
        }
        self.assertEqual(
            {("POST", "/monitors/:param/stop", "resolved"), ("GET", "/monitors", "method_mismatch")},
            eproc,
        )

    def test_external_bases_are_counted_but_not_joined(self):
        external = sorted((call["file"], call["line"]) for call in self.graph["calls"] if call["status"] == "external")
        self.assertEqual(
            [
                ("shop/src/fiscal.service.ts", 20),
                ("shop/src/meta.client.ts", 10),
                ("shop/src/meta.client.ts", 14),
                ("worker/src/djen.py", 7),
            ],
            external,
        )

    def test_same_origin_calls_join_next_route_handlers(self):
        self.assertEqual("resolved", find_call(self.graph, "GET", "/api/session", "web")[0]["status"])
        login = find_call(self.graph, "POST", "/api/auth/login", "web")[0]
        self.assertEqual("orphan", login["status"])
        self.assertEqual(["web"], login["services"])

    def test_python_httpx_calls_resolve_env_bases(self):
        self.assertEqual("resolved", find_call(self.graph, "POST", "/shop/items", "worker")[0]["status"])
        self.assertEqual("resolved", find_call(self.graph, "GET", "/shop/items/:param", "worker")[0]["status"])
        self.assertEqual(3, len([call for call in self.graph["calls"] if call["consumer"] == "worker"]))

    def test_php_full_url_env_is_reported_as_path_in_environment(self):
        calls = [call for call in self.graph["calls"] if call["consumer"] == "fiscal"]
        self.assertEqual(1, len(calls))
        self.assertEqual("path_in_environment", calls[0]["status"])
        self.assertEqual(["identity"], calls[0]["services"])

    def test_spec_files_are_excluded(self):
        self.assertNotIn("GET /spec/only", self.route_keys("shop"))

    def test_output_is_deterministic(self):
        again = api_graph.build_graph(self.repo, Path("api-graph.yaml"))
        self.assertEqual(json.dumps(self.graph, sort_keys=True), json.dumps(again, sort_keys=True))

    def test_fail_on_controls_exit_code(self):
        arguments = ["--root", str(self.repo), "--config", "api-graph.yaml", "--output", "out/graph.json"]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(0, api_graph.main(arguments))
            self.assertEqual(1, api_graph.main(arguments + ["--fail-on", "error"]))
        self.assertTrue((self.repo / "out/graph.json").exists())

    def test_env_bound_to_two_services_is_a_configuration_error(self):
        config = self.repo / "duplicate.yaml"
        config.write_text(
            "services:\n"
            "  a: {framework: nestjs, root: shop, base_env: [SAME]}\n"
            "  b: {framework: nestjs, root: identity, base_env: [SAME]}\n"
            "consumers: {}\n",
            encoding="utf-8",
        )
        stderr = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(stderr):
            self.assertEqual(2, api_graph.main(["--root", str(self.repo), "--config", "duplicate.yaml", "--output", "-"]))
        self.assertIn("bound to more than one service", stderr.getvalue())


ACCEPTED = """
    schema_version: "1.0.0"
    accepted:
      - kind: orphan_call
        category: template
        file: web/src/lib/api.ts
        method: GET
        path: /shop/ghost
        reason: demo call kept on purpose
      - kind: unconsumed_route
        category: planned
        service: fiscal
        method: GET
        path: /api/health
        reason: probe
        reference: docs/probes.md
      - kind: orphan_call
        category: planned
        file: web/src/lib/api.ts
        method: GET
        path: /shop/removed-long-ago
        reason: stale entry
"""


class ApiGraphAcceptedFindingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.repo = Path(cls.tempdir.name)
        build_fixture(cls.repo)
        base = textwrap.dedent(FIXTURE["api-graph.yaml"])
        (cls.repo / "accepted.yaml").write_text(textwrap.dedent(ACCEPTED).lstrip(), encoding="utf-8")
        (cls.repo / "with-accepted.yaml").write_text(base + "accepted_findings: accepted.yaml\n", encoding="utf-8")
        cls.graph = api_graph.build_graph(cls.repo, Path("with-accepted.yaml"))

    @classmethod
    def tearDownClass(cls):
        cls.tempdir.cleanup()

    def findings(self, kind: str) -> list[dict]:
        return [finding for finding in self.graph["findings"] if finding["kind"] == kind]

    def test_accepted_finding_stays_visible_but_does_not_count(self):
        ghost = next(finding for finding in self.findings("orphan_call") if finding["path"] == "/shop/ghost")
        self.assertEqual("template", ghost["accepted"]["category"])
        self.assertEqual(1, self.graph["summary"]["accepted_findings"]["template"])
        self.assertEqual("docs/probes.md", next(f for f in self.findings("unconsumed_route") if f["path"] == "/api/health")["accepted"]["reference"])

    def test_unaccepted_errors_still_block(self):
        active_errors = {finding["kind"] for finding in self.graph["findings"] if finding["severity"] == "error" and not finding["accepted"]}
        self.assertIn("method_mismatch", active_errors)
        self.assertIn("wrong_service", active_errors)

    def test_stale_entry_is_an_error_pointing_to_its_line(self):
        stale = self.findings("stale_accepted_finding")
        self.assertEqual(1, len(stale))
        self.assertEqual(("accepted.yaml", 16), (stale[0]["file"], stale[0]["line"]))
        self.assertIn("/shop/removed-long-ago", stale[0]["message"])
        self.assertIsNone(stale[0]["accepted"])

    def test_gate_passes_only_when_every_error_is_accepted(self):
        errors = [
            finding for finding in api_graph.build_graph(self.repo, Path("api-graph.yaml"))["findings"]
            if finding["severity"] == "error"
        ]
        self.assertGreater(len(errors), 1)
        entries = [
            {"kind": finding["kind"], "category": "planned", "file": finding["file"], "method": finding["method"], "path": finding["path"], "reason": "fixture"}
            for finding in errors
        ]
        base = textwrap.dedent(FIXTURE["api-graph.yaml"])
        (self.repo / "gate.yaml").write_text(base + "accepted_findings: gate-accepted.yaml\n", encoding="utf-8")
        arguments = ["--root", str(self.repo), "--config", "gate.yaml", "--output", "out/gate.json", "--fail-on", "error"]
        with redirect_stdout(io.StringIO()):
            (self.repo / "gate-accepted.yaml").write_text(yaml.safe_dump({"accepted": entries}), encoding="utf-8")
            self.assertEqual(0, api_graph.main(arguments))
            (self.repo / "gate-accepted.yaml").write_text(yaml.safe_dump({"accepted": entries[1:]}), encoding="utf-8")
            self.assertEqual(1, api_graph.main(arguments))

    def test_malformed_entries_are_configuration_errors(self):
        cases = {
            "unknown category": "- kind: orphan_call\n  category: legacy\n  file: a.ts\n  method: GET\n  path: /x\n  reason: r\n",
            "missing reason": "- kind: orphan_call\n  category: planned\n  file: a.ts\n  method: GET\n  path: /x\n",
            "unsupported kind": "- kind: unresolved_call\n  category: planned\n  file: a.ts\n  method: GET\n  path: /x\n  reason: r\n",
            "missing owner": "- kind: unconsumed_route\n  category: planned\n  method: GET\n  path: /x\n  reason: r\n",
            "duplicate": "- kind: orphan_call\n  category: planned\n  file: a.ts\n  method: GET\n  path: /x\n  reason: r\n" * 2,
        }
        for label, body in cases.items():
            with self.subTest(label):
                (self.repo / "bad.yaml").write_text("accepted:\n" + textwrap.indent(body, "  "), encoding="utf-8")
                with self.assertRaises(ValueError):
                    api_graph.load_accepted(self.repo, "bad.yaml")


class ApiGraphImpactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.repo = Path(cls.tempdir.name)
        build_fixture(cls.repo)
        (cls.repo / "shop/src/items.dto.ts").write_text(
            "export class CreateItemDto {\n  name!: string;\n}\n", encoding="utf-8"
        )
        cls.graph = api_graph.build_graph(cls.repo, Path("api-graph.yaml"))

    @classmethod
    def tearDownClass(cls):
        cls.tempdir.cleanup()

    def test_route_selector_lists_consumers_with_param_names_ignored(self):
        result = api_graph.impact(self.graph, self.repo, ["GET /shop/items/:itemId"])
        self.assertEqual(1, len(result["routes"]))
        consumers = {consumer["file"] for consumer in result["routes"][0]["consumers"]}
        self.assertEqual({"web/src/lib/api.ts", "worker/src/client.py"}, consumers)

    def test_provider_dto_file_resolves_routes_of_its_service_only(self):
        result = api_graph.impact(self.graph, self.repo, ["shop/src/items.dto.ts"])
        self.assertEqual([("POST", "/shop/items")], [(route["method"], route["path"]) for route in result["routes"]])
        self.assertEqual([], result["calls"])
        self.assertEqual(
            {"web/src/lib/api.ts", "worker/src/client.py"},
            {consumer["file"] for consumer in result["routes"][0]["consumers"]},
        )

    def test_consumer_file_lists_only_its_own_calls(self):
        result = api_graph.impact(self.graph, self.repo, ["worker/src/client.py"])
        self.assertEqual([], result["routes"])
        self.assertEqual({"worker/src/client.py"}, {call["file"] for call in result["calls"]})

    def test_explicit_type_name_matches_consumer_response_types(self):
        result = api_graph.impact(self.graph, self.repo, ["ItemDto"])
        self.assertIn(("GET", "/shop/items"), {(route["method"], route["path"]) for route in result["routes"]})
        self.assertIn("web/src/lib/api.ts", {call["file"] for call in result["calls"]})

    def test_only_explicit_selectors_are_reported_unmatched(self):
        result = api_graph.impact(self.graph, self.repo, ["NoSuchDto"], diff_paths=["README.md", "shop/src/items.dto.ts"])
        self.assertEqual(["NoSuchDto"], result["unmatched_selectors"])
        self.assertEqual(1, len(result["routes"]))


SLICE_FIXTURE = {
    "graph.yaml": """
        services:
          shop:
            framework: nestjs
            root: shop
            sources: [src]
            base_env: [SHOP_URL]
        consumers:
          web:
            language: typescript
            root: web
            sources: [src]
        accepted_findings: accepted.yaml
    """,
    "accepted.yaml": """
        accepted:
          - kind: unconsumed_route
            category: planned
            service: shop
            method: GET
            path: /orders/:param
            reason: detail screen planned
    """,
    "shop/src/modules/items/items.controller.ts": """
        @Controller('items')
        export class ItemsController {
          @Get()
          list() {}

          @Post()
          create(@Body() dto: CreateItemDto) {}
        }
    """,
    "shop/src/modules/orders/orders.controller.ts": """
        @Controller('orders')
        export class OrdersController {
          @Get()
          list() {}

          @Get(':id')
          get() {}
        }
    """,
    "web/src/modules/items/lib/api.ts": """
        const API = process.env.SHOP_URL;
        async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
          return (await fetch(`${API}${path}`, init)).json();
        }
        export const itemsApi = {
          list: () => request<ItemDto[]>("/items"),
          create: (body: unknown) => request<ItemDto>("/items", { method: "POST", body: JSON.stringify(body) }),
          orders: () => request<OrderDto[]>("/orders"),
          ghost: () => request<void>("/ghost"),
        };
    """,
    "web/src/modules/orders/lib/api.ts": """
        const API = process.env.SHOP_URL;
        export const ordersApi = {
          list: () => fetch(`${API}/orders`),
          items: () => fetch(`${API}/items`),
        };
    """,
}


class ApiGraphSliceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.repo = Path(cls.tempdir.name)
        for relative, content in SLICE_FIXTURE.items():
            path = cls.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")
        cls.graph = api_graph.build_graph(cls.repo, Path("graph.yaml"))

    @classmethod
    def tearDownClass(cls):
        cls.tempdir.cleanup()

    def slice(self, name: str) -> dict:
        return api_graph.build_slice(self.graph, self.repo, name)

    def test_module_slice_contains_only_its_routes_and_calls(self):
        items = self.slice("items")
        self.assertEqual({"GET /items", "POST /items"}, {f"{route['method']} {route['path']}" for route in items["routes"]})
        self.assertEqual({"shop/src/modules/items/items.controller.ts", "web/src/modules/items/lib/api.ts", "web/src/modules/orders/lib/api.ts"}, set(items["cited_files"]))
        self.assertEqual("CreateItemDto", next(route for route in items["routes"] if route["method"] == "POST")["request_type"])

    def test_cross_module_edges_are_both_directions(self):
        items = self.slice("items")
        self.assertEqual([("orders", "GET", "/items")], [(edge["module"], edge["method"], edge["path"]) for edge in items["inbound"]])
        self.assertEqual([("orders", "GET", "/orders")], [(edge["module"], edge["method"], edge["path"]) for edge in items["outbound"]])

    def test_slice_carries_findings_and_accepted_state(self):
        items = self.slice("items")
        self.assertIn("orphan_call", {finding["kind"] for finding in items["findings"] if not finding["accepted"]})
        orders = self.slice("orders")
        detail = next(route for route in orders["routes"] if route["path"] == "/orders/:param")
        self.assertEqual("planned", detail["accepted"])

    def test_rendered_slice_is_compact_deterministic_and_disambiguates_file_names(self):
        text = api_graph.render_slice(self.slice("items"), self.repo)
        self.assertEqual(text, api_graph.render_slice(self.slice("items"), self.repo))
        self.assertIn("used by items/lib/api.ts:", text)
        self.assertIn("in  <- orders: orders/lib/api.ts:", text)
        self.assertIn("## Calls needing attention", text)
        self.assertIn("/ghost -> orphan", text)
        self.assertIn("not measured token usage", text)
        intra_module_call_lines = [line for line in text.splitlines() if line.strip().startswith(":") and "-> items.controller.ts" in line]
        self.assertEqual([], intra_module_call_lines)

    def test_service_slice_covers_all_routes_of_the_service(self):
        shop = self.slice("shop")
        self.assertEqual(4, len(shop["routes"]))
        self.assertEqual("service", shop["scope"])

    def test_unknown_slice_lists_available_names(self):
        stderr = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(stderr):
            code = api_graph.main(["--root", str(self.repo), "--config", "graph.yaml", "--slice", "nope"])
        self.assertEqual(2, code)
        self.assertIn("available: items, orders, shop, web", stderr.getvalue())
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(2, api_graph.main(["--root", str(self.repo), "--config", "graph.yaml", "--slice", ""]))


class ApiGraphRepositoryTests(unittest.TestCase):
    def test_optional_root_missing_is_info_but_required_root_missing_is_warning(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "cfg.yaml").write_text(
                "services: {}\n"
                "consumers:\n"
                "  later: {language: typescript, root: not-yet, optional: true}\n"
                "  typo: {language: typescript, root: wrong-root}\n",
                encoding="utf-8",
            )
            graph = api_graph.build_graph(repo, Path("cfg.yaml"))
        severities = {finding["file"]: finding["severity"] for finding in graph["findings"] if finding["kind"] == "config_path_missing"}
        self.assertEqual({"not-yet": "info", "wrong-root": "warning"}, severities)

    def test_repository_config_covers_existing_services(self):
        graph = api_graph.build_graph(ROOT, api_graph.DEFAULT_CONFIG)
        missing = [finding for finding in graph["findings"] if finding["kind"] == "config_path_missing" and finding["severity"] != "info"]
        self.assertEqual([], missing)
        for service in graph["services"]:
            if service["framework"] != "nextjs":
                self.assertGreater(service["routes"], 0, service["id"])


if __name__ == "__main__":
    unittest.main()
