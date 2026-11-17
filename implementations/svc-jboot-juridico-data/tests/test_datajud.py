import httpx
import pytest
import respx
from pydantic import SecretStr

from juridico_data.config import Settings
from juridico_data.domain.errors import (
    ProcessNotFoundError,
    ProviderTimeoutError,
    RestrictedProcessError,
)
from juridico_data.integrations.datajud import DataJudGateway
from juridico_data.integrations.tribunals import TRIBUNAL_INDICES, datajud_search_url

NUMBER = "00012340820238260100"
BASE = "https://api-publica.datajud.cnj.jus.br"
URL = f"{BASE}/api_publica_tjsp/_search"


def settings() -> Settings:
    return Settings(datajud_api_key=SecretStr("test-key"), identity_jwt_secret=SecretStr("x" * 32))


@pytest.mark.asyncio
async def test_maps_public_process_without_fabricating_missing_movement_date() -> None:
    payload = {
        "hits": {"hits": [{"_source": {
            "numeroProcesso": NUMBER,
            "tribunal": "TJSP",
            "nivelSigilo": 0,
            "classe": {"codigo": 7, "nome": "Procedimento"},
            "orgaoJulgador": {"codigo": 1, "nome": "Vara Unica", "codigoMunicipioIBGE": 3550308},
            "movimentos": [{"codigo": 1, "nome": "Distribuicao"}],
        }}]},
    }
    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.post(URL).mock(return_value=httpx.Response(200, json=payload))
            process = await DataJudGateway(settings(), client).query_process(NUMBER, "TJSP")
    assert route.called
    assert process.movimentacoes[0].data_hora is None
    # A API Publica do DataJud entrega capa e movimentacoes; partes/advogados
    # nao existem no indice, entao o contrato tambem nao os declara.
    assert not hasattr(process, "partes")


@pytest.mark.asyncio
async def test_blocks_restricted_process() -> None:
    payload = {"hits": {"hits": [{"_source": {"nivelSigilo": 1}}]}}
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(URL).mock(return_value=httpx.Response(200, json=payload))
            with pytest.raises(RestrictedProcessError):
                await DataJudGateway(settings(), client).query_process(NUMBER, "TJSP")


@pytest.mark.asyncio
async def test_retries_429_and_respects_attempt_limit() -> None:
    config = settings().model_copy(update={"max_attempts": 2, "max_retry_after_seconds": 0.0})
    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.post(URL).mock(
                return_value=httpx.Response(429, headers={"Retry-After": "30"}),
            )
            with pytest.raises(Exception) as error:
                await DataJudGateway(config, client).query_process(NUMBER, "TJSP")
    assert route.call_count == 2
    assert error.value.__class__.__name__ == "ProviderRateLimitedError"


@pytest.mark.asyncio
async def test_not_found() -> None:
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(URL).mock(return_value=httpx.Response(200, json={"hits": {"hits": []}}))
            with pytest.raises(ProcessNotFoundError):
                await DataJudGateway(settings(), client).query_process(NUMBER, "TJSP")


def test_catalogue_matches_official_datajud_indices() -> None:
    # 4 superiores + 6 TRF + 27 TJ + 24 TRT + 27 TRE + 3 militares
    assert len(TRIBUNAL_INDICES) == 91
    assert "STF" not in TRIBUNAL_INDICES  # o STF nao publica na API Publica (404)
    assert datajud_search_url(BASE, "STF") is None


def test_electoral_indices_use_hyphen() -> None:
    electoral = {k: v for k, v in TRIBUNAL_INDICES.items() if k.startswith("TRE")}
    assert len(electoral) == 27
    assert all(v.startswith("tre-") and len(v) == len("tre-ac") for v in electoral.values())
    assert datajud_search_url(BASE, "TREAC") == f"{BASE}/api_publica_tre-ac/_search"


def test_non_electoral_indices_are_lowercased_siglas() -> None:
    assert datajud_search_url(BASE, "TJSP") == f"{BASE}/api_publica_tjsp/_search"
    assert datajud_search_url(BASE, "TRT15") == f"{BASE}/api_publica_trt15/_search"
    assert datajud_search_url(BASE, "TRF1") == f"{BASE}/api_publica_trf1/_search"


@pytest.mark.asyncio
async def test_parses_both_datajud_timestamp_formats() -> None:
    """O DataJud usa ISO-8601 e compacto yyyyMMddHHmmss no mesmo documento."""
    payload = {
        "hits": {"hits": [{"_source": {
            "numeroProcesso": NUMBER,
            "tribunal": "TJSP",
            "nivelSigilo": 0,
            "dataAjuizamento": "20210901180827",
            "dataHoraUltimaAtualizacao": "2025-11-11T16:39:47.517000Z",
            "movimentos": [{"codigo": 1, "nome": "Baixa", "dataHora": "2025-10-07T18:17:58.000Z"}],
        }}]},
    }
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(URL).mock(return_value=httpx.Response(200, json=payload))
            process = await DataJudGateway(settings(), client).query_process(NUMBER, "TJSP")
    assert process.data_ajuizamento is not None
    assert process.data_ajuizamento.isoformat() == "2021-09-01T18:08:27+00:00"
    assert process.data_ultima_atualizacao is not None
    assert process.data_ultima_atualizacao.year == 2025
    assert process.movimentacoes[0].data_hora is not None


def test_datetime_parser_accepts_date_only_and_rejects_garbage() -> None:
    from juridico_data.integrations.datajud import _datetime

    assert _datetime("20210901") is not None
    assert _datetime("2021-09-01T18:08:27Z") is not None
    assert _datetime("nao-e-data") is None
    assert _datetime("") is None
    assert _datetime(None) is None


@pytest.mark.asyncio
async def test_maps_capa_fields_kept_from_the_datajud_index() -> None:
    payload = {
        "hits": {"hits": [{"_source": {
            "id": "TJSC_JE_50060041320218240058",
            "numeroProcesso": NUMBER,
            "tribunal": "TJSP",
            "nivelSigilo": 0,
            "@timestamp": "2025-11-11T16:39:47.517000Z",
            "formato": {"codigo": 1, "nome": "Eletrônico"},
            "sistema": {"codigo": 3, "nome": "eproc"},
            "movimentos": [
                {
                    "codigo": 1,
                    "nome": "Baixa",
                    "orgaoJulgador": {"codigo": "86129", "nome": "Vara A"},
                },
                {
                    "codigo": 2,
                    "nome": "Remessa",
                    "orgaoJulgador": {"codigoOrgao": 7, "nomeOrgao": "Vara B"},
                },
            ],
        }}]},
    }
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(URL).mock(return_value=httpx.Response(200, json=payload))
            process = await DataJudGateway(settings(), client).query_process(NUMBER, "TJSP")
    assert process.datajud_id == "TJSC_JE_50060041320218240058"
    assert process.sincronizado_em is not None
    assert process.formato is not None and process.formato.nome == "Eletrônico"
    assert process.sistema is not None and process.sistema.nome == "eproc"
    # As duas grafias de orgao julgador de movimento sao aceitas.
    courts = {m.orgao_julgador.nome for m in process.movimentacoes if m.orgao_julgador}
    assert courts == {"Vara A", "Vara B"}


def test_movement_court_ignores_empty_payloads() -> None:
    from juridico_data.integrations.datajud import _movement_court

    assert _movement_court(None) is None
    assert _movement_court({}) is None
    assert _movement_court({"nomeOrgao": "Vara C"}) is not None


def test_djen_parser_truncates_instead_of_rejecting_long_text() -> None:
    """Um teor acima do limite nao pode derrubar a pagina inteira com 500."""
    from juridico_data.integrations.djen import _communication

    item = _communication({
        "hash": "h1",
        "numeroProcesso": "50060041320218240058",
        "siglaTribunal": "TJSC",
        "texto": "x" * 25_000,
        "nomeOrgao": "o" * 900,
    })
    assert item.texto is not None and len(item.texto) == 20_000
    assert item.nome_orgao is not None and len(item.nome_orgao) == 500


@pytest.mark.asyncio
async def test_background_query_uses_longer_timeout_and_single_attempt() -> None:
    """Acompanhamento em segundo plano: uma tentativa, com o limite proprio (ADR 021, Sprint 4)."""
    config = settings().model_copy(
        update={"max_attempts": 3, "background_request_timeout_seconds": 55.0},
    )
    seen: list[float] = []

    def timed_out(request: httpx.Request) -> httpx.Response:
        seen.append(request.extensions["timeout"]["read"])
        raise httpx.ReadTimeout("slow", request=request)

    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(URL).mock(side_effect=timed_out)
            with pytest.raises(ProviderTimeoutError):
                await DataJudGateway(config, client).query_process(
                    NUMBER, "TJSP", background=True,
                )
    assert seen == [55.0]


@pytest.mark.asyncio
async def test_interactive_query_keeps_short_timeout_and_retries() -> None:
    config = settings().model_copy(update={"max_attempts": 2, "max_retry_after_seconds": 0.0})
    seen: list[float] = []

    def timed_out(request: httpx.Request) -> httpx.Response:
        seen.append(request.extensions["timeout"]["read"])
        raise httpx.ReadTimeout("slow", request=request)

    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(URL).mock(side_effect=timed_out)
            with pytest.raises(ProviderTimeoutError):
                await DataJudGateway(config, client).query_process(NUMBER, "TJSP")
    assert seen == [12.0, 12.0]
