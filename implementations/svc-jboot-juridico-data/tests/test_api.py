from datetime import UTC, datetime, timedelta

import httpx
import jwt
import respx
from fastapi.testclient import TestClient
from pydantic import SecretStr

from juridico_data.app import create_app
from juridico_data.config import Settings

DATAJUD = "https://api-publica.datajud.cnj.jus.br"


def settings() -> Settings:
    return Settings(datajud_api_key=SecretStr("test-key"), identity_jwt_secret=SecretStr("x" * 32))


def token(config: Settings, caller: str = "platform-api", audience: str | None = None) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "typ": "service_access",
            "sub": caller,
            "client_id": caller,
            "iss": config.identity_issuer,
            "aud": audience or config.service_audience,
            "iat": now,
            "exp": now + timedelta(minutes=2),
        },
        config.identity_jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def test_health_is_public_but_catalog_requires_service_token() -> None:
    config = settings()
    with TestClient(create_app(config)) as client:
        assert client.get("/health").json() == {"status": "ok", "service": "juridico-data"}
        unauthorized = client.get("/v1/datajud/tribunais")
        assert unauthorized.status_code == 401
        assert unauthorized.headers["content-type"].startswith("application/problem+json")
        response = client.get(
            "/v1/datajud/tribunais",
            headers={"Authorization": f"Bearer {token(config)}"},
        )
    assert response.status_code == 200
    assert response.json()["total"] > 80


def test_rejects_wrong_audience_and_mass_assignment() -> None:
    config = settings()
    with TestClient(create_app(config)) as client:
        assert client.get(
            "/v1/datajud/tribunais",
            headers={"Authorization": f"Bearer {token(config, audience='wrong')}"},
        ).status_code == 401
        response = client.post(
            "/v1/datajud/processos/consulta",
            headers={
                "Authorization": f"Bearer {token(config)}",
                "X-Request-Id": "3e443e6e-2979-4d93-8714-8b95eae2710e",
            },
            json={"numeroProcesso": "00012340820238260100", "url": "http://127.0.0.1"},
        )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_readiness_reports_missing_configuration_without_crashing_process() -> None:
    # Configuracao ausente e declarada explicitamente: `Settings()` leria o
    # ambiente, e o teste passaria a depender de a chave estar ou nao exportada.
    unconfigured = Settings(datajud_api_key=SecretStr(""), identity_jwt_secret=SecretStr(""))
    with TestClient(create_app(unconfigured)) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready", "service": "juridico-data"}


def test_generated_openapi_keeps_the_frozen_paths_and_camel_case_contract() -> None:
    schema = create_app(settings()).openapi()
    assert set(schema["paths"]) == {
        "/health",
        "/ready",
        "/v1/datajud/tribunais",
        "/v1/datajud/processos/consulta",
        "/v1/djen/comunicacoes",
        "/v1/djen/tribunais",
    }
    query_schema = schema["components"]["schemas"]["ProcessQuery"]
    assert set(query_schema["properties"]) == {"numeroProcesso", "tribunal"}


@respx.mock
def test_djen_requires_filter_and_returns_normalized_records() -> None:
    config = settings()
    route = respx.get("https://comunicaapi.pje.jus.br/api/v1/comunicacao").mock(
        return_value=httpx.Response(
            200,
            json={
                "count": 1,
                "items": [
                    {
                        "id": 7,
                        "numero_processo": "00012340820238260100",
                        "siglaTribunal": "TJMS",
                    }
                ],
            },
        )
    )
    with TestClient(create_app(config)) as client:
        headers = {"Authorization": f"Bearer {token(config)}"}
        invalid = client.get("/v1/djen/comunicacoes", headers=headers)
        response = client.get(
            "/v1/djen/comunicacoes?dataDisponibilizacaoInicio=2026-08-01"
            "&dataDisponibilizacaoFim=2026-08-02&siglaTribunal=tjms",
            headers=headers,
        )
    assert invalid.status_code == 422
    assert response.status_code == 200
    assert route.called
    item = response.json()["items"][0]
    assert item["comunicacaoId"] == 7
    assert item["siglaTribunal"] == "TJMS"
    assert "rawData" not in item


@respx.mock
def test_background_mode_header_selects_background_timeout() -> None:
    config = settings().model_copy(update={"background_request_timeout_seconds": 50.0})
    seen: list[float] = []

    def not_found(request: httpx.Request) -> httpx.Response:
        seen.append(request.extensions["timeout"]["read"])
        return httpx.Response(200, json={"hits": {"hits": []}})

    respx.post(f"{DATAJUD}/api_publica_tjsp/_search").mock(side_effect=not_found)
    headers = {
        "Authorization": f"Bearer {token(config)}",
        "X-Request-Id": "3e443e6e-2979-4d93-8714-8b95eae2710e",
    }
    body = {"numeroProcesso": "00012340820238260100", "tribunal": "TJSP"}
    path = "/v1/datajud/processos/consulta"
    with TestClient(create_app(config)) as client:
        background = {**headers, "X-JBoot-Query-Mode": "background"}
        assert client.post(path, headers=background, json=body).status_code == 404
        assert client.post(path, headers=headers, json=body).status_code == 404
        invalid = {**headers, "X-JBoot-Query-Mode": "batch"}
        assert client.post(path, headers=invalid, json=body).status_code == 422
    assert seen == [50.0, 12.0]
