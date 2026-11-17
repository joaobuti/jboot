from __future__ import annotations

from abc import ABC, abstractmethod

from playwright.async_api import Page


class AuthStrategy(ABC):
    @abstractmethod
    async def authenticate(self, page: Page, credential: str) -> None:
        """Autentica no portal. Lança AuthExpiredError se a credencial for inválida."""


class UserPassStrategy(AuthStrategy):
    def __init__(self, username_selector: str, password_selector: str, submit_selector: str) -> None:
        self._username_sel = username_selector
        self._password_sel = password_selector
        self._submit_sel = submit_selector

    async def authenticate(self, page: Page, credential: str) -> None:
        username, _, password = credential.partition(":")
        await page.fill(self._username_sel, username)
        await page.fill(self._password_sel, password)
        await page.click(self._submit_sel)
        await page.wait_for_load_state("networkidle")
