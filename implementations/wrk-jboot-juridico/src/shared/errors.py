class AuthExpiredError(Exception):
    """Credencial inválida ou sessão expirada — não-retryable."""


class CaptchaDetectedError(Exception):
    """CAPTCHA ou bloqueio anti-bot detectado — não-retryable."""


class PortalUnavailableError(Exception):
    """Portal fora do ar ou timeout — retryable."""


class ParseError(Exception):
    """Extração falhou (layout alterado) — retryable."""

    def __init__(self, portal_id: str, selector: str) -> None:
        self.portal_id = portal_id
        self.selector = selector
        super().__init__(f"parse failed on portal={portal_id} selector={selector}")
