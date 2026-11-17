"""DataJud index catalogue derived from mcp-juridico-brasil v0.1.0 (MIT)."""

from juridico_data.domain.models import Tribunal

_TRE_UFS = (
    "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO"
).split()

_CODES = (
    "STJ TST TSE STM TRF1 TRF2 TRF3 TRF4 TRF5 TRF6 "
    "TJAC TJAL TJAM TJAP TJBA TJCE TJDFT TJES TJGO TJMA TJMG TJMS TJMT "
    "TJPA TJPB TJPE TJPI TJPR TJRJ TJRN TJRO TJRR TJRS TJSC TJSE TJSP TJTO "
    + " ".join(f"TRT{i}" for i in range(1, 25))
    + " "
    + " ".join(f"TRE{uf}" for uf in _TRE_UFS)
    + " TJMMG TJMRS TJMSP"
).split()

# Os indices eleitorais usam hifen (`api_publica_tre-ac`); os demais sao a sigla
# em minusculas. `.lower()` sozinho gera 404 em todos os 27 TREs.
TRIBUNAL_INDICES: dict[str, str] = {
    code: f"tre-{code[3:].lower()}" if code.startswith("TRE") else code.lower() for code in _CODES
}


def list_tribunals() -> list[Tribunal]:
    return [Tribunal(sigla=code, nome=_display_name(code)) for code in sorted(TRIBUNAL_INDICES)]


def datajud_search_url(base_url: str, tribunal: str) -> str | None:
    index = TRIBUNAL_INDICES.get(tribunal.upper())
    if not index:
        return None
    return f"{base_url.rstrip('/')}/api_publica_{index}/_search"


def _display_name(code: str) -> str:
    if code.startswith("TJ") and not code.startswith("TJM"):
        return f"Tribunal de Justica {code[2:]}"
    if code.startswith("TRF"):
        return f"Tribunal Regional Federal da {code[3:]}a Regiao"
    if code.startswith("TRT"):
        return f"Tribunal Regional do Trabalho da {code[3:]}a Regiao"
    if code.startswith("TRE"):
        return f"Tribunal Regional Eleitoral {code[3:]}"
    return code
