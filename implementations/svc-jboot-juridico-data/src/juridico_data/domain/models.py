from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        alias_generator=to_camel,
    )


class CodeName(StrictModel):
    codigo: str | int | None = None
    nome: str = Field(max_length=500)


class MovementComplement(StrictModel):
    codigo: str | int | None = None
    nome: str | None = Field(default=None, max_length=500)
    valor: str | None = Field(default=None, max_length=2000)
    descricao: str | None = Field(default=None, max_length=2000)


class Movement(StrictModel):
    codigo: int | None = None
    nome: str = Field(max_length=1000)
    data_hora: datetime | None = None
    # Vara do movimento: redundante em processo de vara unica, relevante quando
    # o processo muda de comarca ao longo da tramitacao.
    orgao_julgador: CodeName | None = None
    complementos: list[MovementComplement] = Field(default_factory=list, max_length=100)


class Process(StrictModel):
    numero_processo: str
    tribunal: str
    # Identificador do processo no indice do CNJ (ex: TJSC_JE_5006004...).
    datajud_id: str | None = Field(default=None, max_length=200)
    grau: str | None = None
    data_ajuizamento: datetime | None = None
    data_ultima_atualizacao: datetime | None = None
    # `@timestamp` do indice: marca de sincronizacao do CNJ, nao data
    # processual. E o cursor exigido por `search_after` na busca paginada.
    sincronizado_em: datetime | None = None
    nivel_sigilo: int = Field(ge=0, le=0)
    classe: CodeName | None = None
    formato: CodeName | None = None
    sistema: CodeName | None = None
    orgao_julgador: CodeName | None = None
    assuntos: list[CodeName] = Field(default_factory=list, max_length=100)
    movimentacoes: list[Movement] = Field(default_factory=list, max_length=500)


class Tribunal(StrictModel):
    sigla: str
    nome: str


class ProcessQuery(StrictModel):
    numero_processo: str = Field(min_length=20, max_length=25)
    tribunal: str | None = Field(default=None, pattern=r"^[A-Z0-9-]{2,16}$")


class ProcessQueryResponse(StrictModel):
    request_id: str
    source: str = "datajud"
    captured_at: datetime
    process: Process


class TribunalListResponse(StrictModel):
    items: list[Tribunal]
    total: int = Field(ge=0)


class DjenCommunication(StrictModel):
    """Registro DJEN normalizado, sem repassar o payload bruto do provedor."""

    hash: str
    comunicacao_id: int | None = None
    numero_comunicacao: int | None = None
    numero_processo: str | None = Field(default=None, max_length=30)
    numero_processo_mask: str | None = Field(default=None, max_length=40)
    sigla_tribunal: str | None = Field(default=None, max_length=20)
    nome_orgao: str | None = Field(default=None, max_length=500)
    tipo_comunicacao: str | None = Field(default=None, max_length=160)
    tipo_documento: str | None = Field(default=None, max_length=160)
    nome_classe: str | None = Field(default=None, max_length=500)
    meio: str | None = Field(default=None, max_length=10)
    link: str | None = Field(default=None, max_length=2000)
    texto: str | None = Field(default=None, max_length=20_000)
    data_disponibilizacao: date | None = None
    destinatarios: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    advogados: list[dict[str, Any]] = Field(default_factory=list, max_length=100)


class DjenCommunicationPage(StrictModel):
    items: list[DjenCommunication] = Field(max_length=100)
    count: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)


class DjenTribunal(StrictModel):
    sigla: str | None = Field(default=None, max_length=20)
    nome: str | None = Field(default=None, max_length=500)


class DjenTribunalListResponse(StrictModel):
    items: list[DjenTribunal]
    total: int = Field(ge=0)


class HealthResponse(StrictModel):
    status: str
    service: str = "juridico-data"


class Problem(StrictModel):
    type: str
    title: str
    status: int
    code: str
    request_id: str
