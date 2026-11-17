import asyncio
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from juridico_data.config import Settings
from juridico_data.domain.errors import (
    ProcessNotFoundError,
    ProviderRateLimitedError,
    ProviderSchemaError,
    ProviderTimeoutError,
    RestrictedProcessError,
    UnsupportedTribunalError,
)
from juridico_data.domain.models import CodeName, Movement, MovementComplement, Process
from juridico_data.integrations.tribunals import datajud_search_url

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class DataJudGateway:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._semaphore = asyncio.Semaphore(settings.max_concurrency)
        self._rate_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def query_process(
        self, number: str, tribunal: str, *, background: bool = False
    ) -> Process:
        url = datajud_search_url(self._settings.datajud_base_url, tribunal)
        if url is None:
            raise UnsupportedTribunalError
        response = await self._request(
            url,
            {"query": {"term": {"numeroProcesso": number}}, "size": 1},
            background=background,
        )
        try:
            payload: Any = response.json()
            hits = payload["hits"]["hits"]
            if not isinstance(hits, list):
                raise TypeError
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderSchemaError from exc
        if not hits:
            raise ProcessNotFoundError
        try:
            source = hits[0]["_source"]
            if not isinstance(source, Mapping):
                raise TypeError
            return parse_process(source, number, tribunal)
        except RestrictedProcessError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderSchemaError from exc

    async def _request(
        self, url: str, body: dict[str, Any], *, background: bool = False
    ) -> httpx.Response:
        last_response: httpx.Response | None = None
        max_attempts = 1 if background else self._settings.max_attempts
        timeout = (
            self._settings.background_request_timeout_seconds
            if background
            else self._settings.request_timeout_seconds
        )
        async with self._semaphore:
            for attempt in range(1, max_attempts + 1):
                try:
                    await self._throttle()
                    response = await self._client.post(
                        url,
                        headers={
                            "Authorization": (
                                f"APIKey {self._settings.datajud_api_key.get_secret_value()}"
                            ),
                        },
                        json=body,
                        timeout=timeout,
                    )
                    last_response = response
                    if response.status_code not in RETRYABLE_STATUS:
                        try:
                            response.raise_for_status()
                        except httpx.HTTPStatusError as exc:
                            raise ProviderSchemaError from exc
                        return response
                except httpx.TimeoutException as exc:
                    if attempt == max_attempts:
                        raise ProviderTimeoutError from exc
                except httpx.HTTPError as exc:
                    if attempt == max_attempts:
                        raise ProviderSchemaError from exc

                if attempt < max_attempts:
                    await asyncio.sleep(self._retry_delay(last_response, attempt))

        if last_response is not None and last_response.status_code == 429:
            raise ProviderRateLimitedError
        raise ProviderSchemaError

    async def _throttle(self) -> None:
        async with self._rate_lock:
            now = time.monotonic()
            wait = self._settings.min_request_interval_seconds - (now - self._last_request_at)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request_at = time.monotonic()

    def _retry_delay(self, response: httpx.Response | None, attempt: int) -> float:
        if response is not None:
            value = response.headers.get("Retry-After")
            if value:
                try:
                    delay = float(value)
                except ValueError:
                    try:
                        delay = float(
                            (
                                parsedate_to_datetime(value) - datetime.now().astimezone()
                            ).total_seconds(),
                        )
                    except (TypeError, ValueError):
                        delay = 0.0
                return float(max(0.0, min(delay, self._settings.max_retry_after_seconds)))
        return float(min(0.25 * (2 ** (attempt - 1)), self._settings.max_retry_after_seconds))


def parse_process(source: Mapping[str, Any], fallback_number: str, tribunal: str) -> Process:
    secrecy = int(source.get("nivelSigilo", 0))
    if secrecy > 0:
        raise RestrictedProcessError

    movements = [_movement(item) for item in _list_of_mappings(source.get("movimentos"))[:500]]
    movements.sort(
        key=lambda item: (
            item.data_hora is not None,
            item.data_hora.isoformat() if item.data_hora else "",
        ),
        reverse=True,
    )
    return Process(
        numero_processo=str(source.get("numeroProcesso") or fallback_number),
        tribunal=str(source.get("tribunal") or tribunal),
        datajud_id=_optional_string(source.get("id")),
        grau=_optional_string(source.get("grau")),
        data_ajuizamento=_datetime(source.get("dataAjuizamento")),
        data_ultima_atualizacao=_datetime(source.get("dataHoraUltimaAtualizacao")),
        sincronizado_em=_datetime(source.get("@timestamp")),
        nivel_sigilo=0,
        classe=_code_name(source.get("classe")),
        formato=_code_name(source.get("formato")),
        sistema=_code_name(source.get("sistema")),
        orgao_julgador=_code_name(source.get("orgaoJulgador")),
        assuntos=[
            item
            for raw in _list_of_mappings(source.get("assuntos"))[:100]
            if (item := _code_name(raw))
        ],
        movimentacoes=movements,
    )


def _movement(raw: Mapping[str, Any]) -> Movement:
    complements = [
        MovementComplement(
            codigo=item.get("codigo"),
            nome=_optional_string(item.get("nome")),
            valor=_optional_string(item.get("valor")),
            descricao=_optional_string(item.get("descricao")),
        )
        for item in _list_of_mappings(raw.get("complementosTabelados"))[:100]
    ]
    code = raw.get("codigo")
    return Movement(
        codigo=int(code) if isinstance(code, (int, str)) and str(code).isdigit() else None,
        nome=str(raw.get("nome") or "")[:1000],
        data_hora=_datetime(raw.get("dataHora")),
        orgao_julgador=_movement_court(raw.get("orgaoJulgador")),
        complementos=complements,
    )


def _movement_court(raw: Any) -> CodeName | None:
    """O glossario do CNJ documenta `codigoOrgao`/`nomeOrgao`, mas documentos
    reais tambem trazem `codigo`/`nome`. Aceita as duas grafias."""
    if not isinstance(raw, Mapping):
        return None
    name = raw.get("nomeOrgao") if raw.get("nomeOrgao") is not None else raw.get("nome")
    code = raw.get("codigoOrgao") if raw.get("codigoOrgao") is not None else raw.get("codigo")
    if code is None and not name:
        return None
    return CodeName(codigo=code, nome=str(name or "")[:500])



def _code_name(raw: Any) -> CodeName | None:
    if not isinstance(raw, Mapping):
        return None
    return CodeName(codigo=raw.get("codigo"), nome=str(raw.get("nome") or "")[:500])


def _list_of_mappings(raw: Any) -> list[Mapping[str, Any]]:
    return [item for item in raw if isinstance(item, Mapping)] if isinstance(raw, list) else []


# O DataJud mistura dois formatos no mesmo documento: ISO-8601 em
# `dataHoraUltimaAtualizacao` e em `movimentos[].dataHora`, e compacto
# `yyyyMMddHHmmss` (ou `yyyyMMdd`) em `dataAjuizamento`.
_COMPACT_FORMATS = ("%Y%m%d%H%M%S", "%Y%m%d")


def _datetime(raw: Any) -> datetime | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        pass
    for fmt in _COMPACT_FORMATS:
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _optional_string(raw: Any) -> str | None:
    return str(raw) if raw is not None else None
