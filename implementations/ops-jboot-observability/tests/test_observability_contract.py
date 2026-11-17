import json
import pathlib
import unittest

import yaml


ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]


class ObservabilityContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.compose = yaml.safe_load((ROOT / "compose.yaml").read_text(encoding="utf-8"))
        cls.otel = yaml.safe_load(
            (ROOT / "config/otel/otel-gateway.yaml").read_text(encoding="utf-8")
        )
        cls.mimir_text = (ROOT / "config/mimir/mimir.yaml").read_text(encoding="utf-8")
        cls.tempo_text = (ROOT / "config/tempo/tempo.yaml").read_text(encoding="utf-8")
        cls.loki_text = (ROOT / "config/loki/loki.yaml").read_text(encoding="utf-8")

    def test_images_are_version_pinned(self) -> None:
        for name, service in self.compose["services"].items():
            image = service.get("image")
            if image:
                self.assertIn(":", image, name)
                self.assertNotIn(":latest", image, name)

    def test_mongodb_is_not_a_runtime_dependency(self) -> None:
        self.assertNotIn("mongodb", self.compose["services"])
        self.assertNotIn("mongo", " ".join(self.compose["services"]))

    def test_published_ports_are_loopback_or_docker_bridge_only(self) -> None:
        for name, service in self.compose["services"].items():
            for port in service.get("ports", []):
                value = str(port)
                allowed = value.startswith("127.0.0.1:") or (
                    name == "otel-gateway"
                    and value.startswith("${OBS_DOCKER_GATEWAY_ADDRESS:-172.17.0.1}:")
                )
                self.assertTrue(allowed, f"{name}: {port}")
                self.assertFalse(value.startswith("0.0.0.0:"), f"{name}: {port}")

    def test_object_storage_buckets_are_separate(self) -> None:
        expected = {
            "jboot-observability-mimir-blocks",
            "jboot-observability-mimir-ruler",
            "jboot-observability-mimir-alertmanager",
            "jboot-observability-tempo-traces",
            "jboot-observability-loki-chunks",
        }
        combined = "\n".join((self.mimir_text, self.tempo_text, self.loki_text))
        for bucket in expected:
            self.assertIn(bucket, combined)
        self.assertEqual(len(expected), 5)

    def test_gateway_exports_all_signals_with_tenant_header(self) -> None:
        exporters = self.otel["exporters"]
        expected = {"otlp_http/tempo", "prometheus_remote_write/mimir", "otlp_http/loki"}
        self.assertTrue(expected.issubset(exporters))
        for name in expected:
            self.assertEqual(exporters[name]["headers"]["X-Scope-OrgID"], "${env:OBS_TENANT_ID}")

    def test_root_collector_forwards_all_signals_to_platform(self) -> None:
        root_collector = yaml.safe_load(
            (REPO_ROOT / "docker/otel/otel-collector.yaml").read_text(encoding="utf-8")
        )
        exporter = root_collector["exporters"]["otlp_http/observability"]
        self.assertEqual(exporter["endpoint"], "${env:JBOOT_OBSERVABILITY_OTLP_ENDPOINT}")
        root_compose = yaml.safe_load(
            (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        )
        self.assertEqual(
            root_compose["services"]["otel-collector"]["environment"][
                "JBOOT_OBSERVABILITY_OTLP_ENDPOINT"
            ],
            "${JBOOT_OBSERVABILITY_OTLP_ENDPOINT:-http://host.docker.internal:14318}",
        )
        for signal in ("traces", "metrics", "logs"):
            self.assertIn(
                "otlp_http/observability",
                root_collector["service"]["pipelines"][signal]["exporters"],
            )

    def test_redaction_precedes_every_export(self) -> None:
        pipelines = self.otel["service"]["pipelines"]
        for signal in ("traces", "metrics", "logs"):
            processors = pipelines[signal]["processors"]
            self.assertIn("resource/redact", processors)
            self.assertIn("attributes/redact", processors)
            self.assertLess(processors.index("attributes/redact"), processors.index("batch"))

        deleted = {
            item["key"]
            for item in self.otel["processors"]["attributes/redact"]["actions"]
            if item["action"] == "delete"
        }
        self.assertTrue({"http.request.header.authorization", "db.statement", "gen_ai.prompt"}.issubset(deleted))

    def test_retention_contract_is_explicit(self) -> None:
        self.assertIn("compactor_blocks_retention_period: 9504h", self.mimir_text)
        self.assertIn("block_retention: 336h", self.tempo_text)
        self.assertIn("flush_all_on_shutdown: true", self.tempo_text)
        self.assertIn("retention_period: 720h", self.loki_text)

    def test_grafana_dashboard_is_valid_json(self) -> None:
        dashboard = json.loads(
            (ROOT / "config/grafana/dashboards/platform-overview.json").read_text(encoding="utf-8")
        )
        self.assertEqual(dashboard["uid"], "jboot-observability-overview")
        self.assertGreaterEqual(len(dashboard["panels"]), 5)

    def test_alert_has_owner_severity_and_runbook(self) -> None:
        alerting = yaml.safe_load(
            (ROOT / "config/grafana/provisioning/alerting/rules.yaml").read_text(encoding="utf-8")
        )
        rule = alerting["groups"][0]["rules"][0]
        self.assertEqual(rule["labels"]["owner"], "platform-sre")
        self.assertIn(rule["labels"]["severity"], {"warning", "critical"})
        runbook = ROOT / rule["annotations"]["runbook"]
        self.assertTrue(runbook.is_file())



if __name__ == "__main__":
    unittest.main()
