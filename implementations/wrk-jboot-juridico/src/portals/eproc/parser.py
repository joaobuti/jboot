from __future__ import annotations

import re
from typing import Any

from ...shared.contracts import ProcessoEncontrado


def parse_eproc_results(data: dict[str, Any] | list[dict[str, Any]]) -> list[ProcessoEncontrado]:
    resultados: list[dict[str, Any]]
    if isinstance(data, list):
        resultados = data
    else:
        resultados = data.get("resultados", [])
    processos: list[ProcessoEncontrado] = []
    for r in resultados:
        processos.append(
            ProcessoEncontrado(
                numero=_process_number(r.get("nr_processo", "")),
                tribunal="TJSC",
                assunto=r.get("des_assuntos"),
                data_distribuicao=_parse_date(r.get("autuacao")),
                raw={
                    "raw_data": r,
                    "data_autuacao": _parse_date(r.get("autuacao")),
                    "juizo": r.get("str_sig_orgao_juizo"),
                    "autor": _strip_html(r.get("autor", "")),
                    "reu": _strip_html(r.get("reu", "")),
                    "classe": r.get("classe"),
                    "ultimo_evento": r.get("ultimo_evento"),
                    "situacao": r.get("des_situacao"),
                    "link": r.get("linkProcessoAssinado"),
                    "parties": r.get("parties") or [],
                },
            )
        )
    return processos


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip().rstrip(",").strip()


def _process_number(value: str) -> str:
    visible_text = _strip_html(value)
    return re.sub(r"\D", "", visible_text)


def _parse_date(date_str: str | None) -> str | None:
    if not date_str:
        return None
    try:
        day, month, year = date_str.split(" ")[0].split("/")
        return f"{year}-{month}-{day}"
    except Exception:
        return date_str
