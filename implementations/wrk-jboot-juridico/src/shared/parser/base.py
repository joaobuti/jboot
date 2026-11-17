from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..contracts import ProcessoEncontrado


class BaseParser(ABC):
    @abstractmethod
    def parse(self, raw: list[dict[str, Any]]) -> list[ProcessoEncontrado]:
        """Normaliza dados brutos extraídos do portal para ProcessoEncontrado."""
