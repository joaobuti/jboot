from __future__ import annotations

import os
from abc import ABC, abstractmethod

from playwright.async_api import Browser, BrowserContext, async_playwright

from ..shared.auth.strategies import AuthStrategy
from ..shared.contracts import ConsultaInput, ProcessoEncontrado
from ..shared.parser.base import BaseParser


class BasePortalAdapter(ABC):
    portal_id: str
    base_url: str
    auth_strategy: AuthStrategy
    parser: BaseParser

    _timeout_ms: int = int(os.getenv("PORTAL_TIMEOUT_MS", "30000"))

    async def execute(self, input: ConsultaInput) -> list[ProcessoEncontrado]:
        async with async_playwright() as pw:
            browser: Browser = await pw.chromium.launch(headless=True)
            context: BrowserContext = await browser.new_context()
            try:
                page = await context.new_page()
                page.set_default_timeout(self._timeout_ms)
                await page.goto(self.base_url)
                await self.auth_strategy.authenticate(page, input.credential_encrypted)
                raw = await self.fetch(page, input)
                return self.parser.parse(raw)
            finally:
                await context.close()
                await browser.close()

    @abstractmethod
    async def fetch(self, page: object, input: ConsultaInput) -> list[dict[object, object]]:
        """Navega e extrai dados brutos do portal."""
