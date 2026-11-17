"""Cliente restrito da API publica Comunica PJe (DJEN)."""

from __future__ import annotations

import asyncio
import hashlib
from datetime import date
from typing import Any

import httpx

from juridico_data.config import Settings
from juridico_data.domain.models import (
    DjenCommunication,
    DjenCommunicationPage,
    DjenTribunal,
    DjenTribunalListResponse,
)


class DjenProviderError(Exception):
    pass


class DjenGateway:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    async def comunicacoes(self, params: dict[str, str]) -> DjenCommunicationPage:
        payload = await self._request("/api/v1/comunicacao", params=params)
        if not isinstance(payload, dict):
            raise DjenProviderError("Resposta DJEN invalida")
        items = payload.get("items", [])
        if not isinstance(items, list):
            raise DjenProviderError("Lista DJEN invalida")
        return DjenCommunicationPage(
            items=[_communication(item) for item in items if isinstance(item, dict)],
            count=_as_int(payload.get("count")) or 0,
            page=int(params["pagina"]),
            page_size=int(params["itensPorPagina"]),
        )

    async def tribunais(self) -> DjenTribunalListResponse:
        payload = await self._request("/api/v1/comunicacao/tribunal")
        if not isinstance(payload, list):
            raise DjenProviderError("Lista de tribunais DJEN invalida")
        items = [
            DjenTribunal(
                sigla=_as_str(_first(item, "sigla", "siglaTribunal")),
                nome=_as_str(_first(item, "nome", "nomeTribunal")),
            )
            for item in payload
            if isinstance(item, dict)
        ]
        return DjenTribunalListResponse(items=items, total=len(items))

    async def _request(self, path: str, params: dict[str, str] | None = None) -> Any:
        for attempt in range(self._settings.max_attempts):
            try:
                response = await self._client.get(
                    f"{self._settings.djen_base_url}{path}",
                    params=params,
                    timeout=self._settings.request_timeout_seconds,
                )
                if response.status_code == 429 and attempt + 1 < self._settings.max_attempts:
                    await asyncio.sleep(
                        _retry_after(response, self._settings.max_retry_after_seconds)
                    )
                    continue
                response.raise_for_status()
                return response.json()
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt + 1 == self._settings.max_attempts:
                    raise DjenProviderError("DJEN indisponivel") from exc
                await asyncio.sleep(self._settings.min_request_interval_seconds * (attempt + 1))
            except httpx.HTTPStatusError as exc:
                raise DjenProviderError("DJEN recusou a consulta") from exc
            except ValueError as exc:
                raise DjenProviderError("Resposta DJEN invalida") from exc
        raise DjenProviderError("DJEN indisponivel")


def _retry_after(response: httpx.Response, maximum: float) -> float:
    try:
        return min(maximum, max(0.0, float(response.headers.get("retry-after", "0"))))
    except ValueError:
        return 0.0


def _first(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = raw.get(key)
        if value not in (None, ""):
            return value
    return None


def _as_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _as_str(value: Any, limit: int | None = None) -> str | None:
    """Trunca no limite do contrato em vez de deixar o Pydantic rejeitar.

    O DJEN publica teor livre, sem teto: um unico documento acima do limite
    fazia o `max_length` do modelo levantar ValidationError e derrubar a pagina
    inteira com 500, perdendo as outras comunicacoes. Truncar e o comportamento
    ja usado no parser do DataJud.
    """
    text = str(value).strip() if value is not None else ""
    if limit is not None:
        text = text[:limit]
    return text or None


def _as_date(value: Any) -> date | None:
    text = _as_str(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        try:
            day, month, year = text.split("/")
            return date(int(year), int(month), int(day))
        except ValueError:
            return None


def _dict_list(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _advogados(raw: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for relation in _dict_list(raw.get("destinatarioadvogados")):
        lawyer = relation.get("advogado")
        if isinstance(lawyer, dict):
            result.append(
                {
                    "id": _as_int(lawyer.get("id")),
                    "nome": _as_str(lawyer.get("nome")),
                    "numero_oab": _as_str(lawyer.get("numero_oab")),
                    "uf_oab": _as_str(lawyer.get("uf_oab")),
                }
            )
    return result


def _communication(raw: dict[str, Any]) -> DjenCommunication:
    identity = "|".join(
        str(_first(raw, key) or "")
        for key in (
            "id",
            "numeroComunicacao",
            "numero_processo",
            "data_disponibilizacao",
            "siglaTribunal",
        )
    )
    return DjenCommunication(
        hash=_as_str(raw.get("hash")) or f"jboot:{hashlib.sha256(identity.encode()).hexdigest()}",
        comunicacao_id=_as_int(raw.get("id")),
        numero_comunicacao=_as_int(_first(raw, "numeroComunicacao", "numero_comunicacao")),
        numero_processo=_as_str(_first(raw, "numero_processo", "numeroProcesso"), 30),
        numero_processo_mask=_as_str(
            _first(raw, "numeroprocessocommascara", "numeroProcessoComMascara"), 40
        ),
        sigla_tribunal=_as_str(_first(raw, "siglaTribunal", "sigla_tribunal"), 20),
        nome_orgao=_as_str(_first(raw, "nomeOrgao", "nome_orgao", "orgao"), 500),
        tipo_comunicacao=_as_str(_first(raw, "tipoComunicacao", "tipo_comunicacao"), 160),
        tipo_documento=_as_str(_first(raw, "tipoDocumento", "tipo_documento"), 160),
        nome_classe=_as_str(_first(raw, "nomeClasse", "nome_classe"), 500),
        meio=_as_str(raw.get("meio"), 10),
        link=_as_str(raw.get("link"), 2000),
        texto=_as_str(raw.get("texto"), 20000),
        data_disponibilizacao=_as_date(
            _first(raw, "data_disponibilizacao", "datadisponibilizacao")
        ),
        destinatarios=_dict_list(raw.get("destinatarios")),
        advogados=_advogados(raw),
    )
