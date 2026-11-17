from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated, Literal, cast
from uuid import UUID, uuid4

import httpx
import structlog
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from juridico_data.api.auth import require_service_caller
from juridico_data.config import Settings, get_settings
from juridico_data.domain.errors import JuridicoDataError
from juridico_data.domain.models import (
    DjenCommunicationPage,
    DjenTribunalListResponse,
    HealthResponse,
    ProcessQuery,
    ProcessQueryResponse,
    TribunalListResponse,
)
from juridico_data.domain.service import JuridicoDataService
from juridico_data.integrations.datajud import DataJudGateway
from juridico_data.integrations.djen import DjenGateway, DjenProviderError

logger = structlog.get_logger()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        active_settings = resolved or get_settings()
        client = httpx.AsyncClient(follow_redirects=False)
        app.state.settings = active_settings
        app.state.http_client = client
        app.state.service = JuridicoDataService(DataJudGateway(active_settings, client))
        app.state.djen = DjenGateway(active_settings, client)
        try:
            yield
        finally:
            await client.aclose()

    app = FastAPI(title="JBoot Juridico Data Internal API", version="0.1.0", lifespan=lifespan)
    if resolved is not None:
        app.dependency_overrides[get_settings] = lambda: resolved

    def service(request: Request) -> JuridicoDataService:
        return cast(JuridicoDataService, request.app.state.service)

    def djen(request: Request) -> DjenGateway:
        return cast(DjenGateway, request.app.state.djen)

    @app.middleware("http")
    async def request_limits(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request.state.request_id = request.headers.get("X-Request-Id") or str(uuid4())
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > 4096:
            return _problem(
                413,
                "request_too_large",
                "Request body is too large",
                request.state.request_id,
            )
        return await call_next(request)

    @app.exception_handler(JuridicoDataError)
    async def domain_error(request: Request, exc: JuridicoDataError) -> JSONResponse:
        request_id = request.state.request_id
        logger.warning("juridico_data_request_failed", code=exc.code, request_id=request_id)
        return _problem(exc.status, exc.code, exc.title, request_id)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, _exc: RequestValidationError) -> JSONResponse:
        return _problem(
            422,
            "validation_error",
            "Request validation failed",
            request.state.request_id,
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        code = {
            401: "unauthorized",
            403: "forbidden",
            413: "request_too_large",
            503: "provider_unavailable",
        }.get(exc.status_code, "provider_unavailable")
        return _problem(exc.status_code, code, str(exc.detail), request.state.request_id)

    @app.get("/health", response_model=HealthResponse, tags=["Operational"])
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/ready", response_model=HealthResponse, tags=["Operational"])
    async def ready(request: Request) -> HealthResponse | JSONResponse:
        active: Settings = request.app.state.settings
        configured = bool(
            active.datajud_api_key.get_secret_value()
            and active.identity_jwt_secret.get_secret_value()
            and active.caller_allowlist
        )
        response = HealthResponse(status="ok" if configured else "not_ready")
        if configured:
            return response
        return JSONResponse(status_code=503, content=response.model_dump(by_alias=True))

    @app.get(
        "/v1/datajud/tribunais",
        response_model=TribunalListResponse,
        dependencies=[Depends(require_service_caller)],
        tags=["DataJud"],
    )
    async def tribunals(
        current: Annotated[JuridicoDataService, Depends(service)],
    ) -> TribunalListResponse:
        return current.tribunals()

    @app.post(
        "/v1/datajud/processos/consulta",
        response_model=ProcessQueryResponse,
        dependencies=[Depends(require_service_caller)],
        tags=["DataJud"],
    )
    async def query_process(
        body: ProcessQuery,
        current: Annotated[JuridicoDataService, Depends(service)],
        x_request_id: Annotated[UUID, Header(alias="X-Request-Id")],
        x_query_mode: Annotated[
            Literal["interactive", "background"], Header(alias="X-JBoot-Query-Mode")
        ] = "interactive",
    ) -> ProcessQueryResponse:
        request_id = str(x_request_id)
        return await current.query_process(
            body, request_id, background=x_query_mode == "background"
        )

    @app.get(
        "/v1/djen/comunicacoes",
        response_model=DjenCommunicationPage,
        dependencies=[Depends(require_service_caller)],
        tags=["DJEN"],
    )
    async def djen_comunicacoes(
        request: Request,
        pagina: int = Query(default=1, ge=1),
        itens_por_pagina: int = Query(default=100, alias="itensPorPagina", ge=1, le=100),
        data_inicio: date = Query(alias="dataDisponibilizacaoInicio"),  # noqa: B008
        data_fim: date = Query(alias="dataDisponibilizacaoFim"),  # noqa: B008
        numero_oab: str | None = Query(default=None, alias="numeroOab", pattern=r"^\d{1,20}$"),
        uf_oab: str | None = Query(default=None, alias="ufOab", pattern=r"^[A-Za-z]{2}$"),
        nome_advogado: str | None = Query(
            default=None, alias="nomeAdvogado", min_length=1, max_length=180
        ),
        nome_parte: str | None = Query(
            default=None, alias="nomeParte", min_length=1, max_length=180
        ),
        numero_processo: str | None = Query(
            default=None, alias="numeroProcesso", pattern=r"^\d{15,25}$"
        ),
        sigla_tribunal: str | None = Query(
            default=None, alias="siglaTribunal", pattern=r"^[A-Za-z0-9]{2,20}$"
        ),
    ) -> DjenCommunicationPage:
        if data_inicio > data_fim or (numero_oab is None) != (uf_oab is None):
            raise HTTPException(status_code=422, detail="Filtro DJEN invalido")
        if not any([numero_oab, nome_advogado, nome_parte, numero_processo, sigla_tribunal]):
            raise HTTPException(status_code=422, detail="Filtro DJEN insuficiente")
        params = {
            "pagina": str(pagina),
            "itensPorPagina": str(itens_por_pagina),
            "dataDisponibilizacaoInicio": data_inicio.isoformat(),
            "dataDisponibilizacaoFim": data_fim.isoformat(),
        }
        optional = {
            "numeroOab": numero_oab,
            "ufOab": uf_oab.upper() if uf_oab else None,
            "nomeAdvogado": nome_advogado,
            "nomeParte": nome_parte,
            "numeroProcesso": numero_processo,
            "siglaTribunal": sigla_tribunal.upper() if sigla_tribunal else None,
        }
        params.update({key: value for key, value in optional.items() if value is not None})
        try:
            return await djen(request).comunicacoes(params)
        except DjenProviderError as exc:
            raise HTTPException(status_code=503, detail="DJEN indisponivel") from exc

    @app.get(
        "/v1/djen/tribunais",
        response_model=DjenTribunalListResponse,
        dependencies=[Depends(require_service_caller)],
        tags=["DJEN"],
    )
    async def djen_tribunais(request: Request) -> DjenTribunalListResponse:
        try:
            return await djen(request).tribunais()
        except DjenProviderError as exc:
            raise HTTPException(status_code=503, detail="DJEN indisponivel") from exc

    return app


def _problem(status: int, code: str, title: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": f"https://docs.jboot.local/problems/{code}",
            "title": title,
            "status": status,
            "code": code,
            "requestId": request_id,
        },
    )


app = create_app()
