from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass

import asyncpg
from playwright.async_api import Page, async_playwright

from .crypto import encrypt_session
from .session_db import poll_for_field, save_session, update_phase

log = logging.getLogger(__name__)

SSO_LOGIN_URL = (
    "https://sso.tjsc.jus.br/realms/eproc/protocol/openid-connect/auth"
    "?response_type=code"
    "&redirect_uri=https%3A%2F%2Feproc1g.tjsc.jus.br%2Feproc%2Fexterno_controlador.php%3Facao%3DSSO%2Fcallback"
    "&client_id=eproc-tjsc-1g"
    "&scope=profile+openid"
)
EPROC_BASE = "https://eproc1g.tjsc.jus.br/eproc"
TIMEOUT_MS = int(os.getenv("PORTAL_TIMEOUT_MS", "30000"))


@dataclass
class SetupResult:
    status: str  # completed | failed
    setup_id: str
    error: str | None = None


async def run_eproc_setup(
    setup_id: str,
    client_id: str,
    username: str,
    password: str,
    database_url: str,
    preferred_profile: str | None = None,
) -> SetupResult:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
                context = await browser.new_context(viewport={"width": 1920, "height": 1080})
                try:
                    page = await context.new_page()
                    page.set_default_timeout(TIMEOUT_MS)

                    # ── Phase 1: Login ────────────────────────────────────────────
                    await page.goto(SSO_LOGIN_URL)
                    await page.wait_for_load_state("networkidle")
                    await _fill_first_visible(
                        page,
                        ["#username", 'input[name="username"]'],
                        username,
                        "username",
                    )
                    await _fill_first_visible(
                        page,
                        ["#password", "input.masked", 'input[name="password"]', 'input[type="password"]'],
                        password,
                        "password",
                    )
                    await page.click('button[type="submit"], input[type="submit"]')
                    await page.wait_for_load_state("networkidle")

                    # ── Phase 2: 2FA (TOTP) ───────────────────────────────────────
                    if await page.locator('input[name="otp"]').count() > 0:
                        await update_phase(conn, setup_id, "waiting_2fa")
                        log.info("eProc setup %s: waiting for 2FA code", setup_id)

                        totp_code = await poll_for_field(
                            conn, setup_id, "totp_code", timeout_seconds=600
                        )

                        # Check "Não usar 2FA neste dispositivo" to skip on future logins
                        save_device = page.locator('input[name="saveDevice"]')
                        if await save_device.count() > 0 and not await save_device.is_checked():
                            await save_device.check()

                        await _fill_first_visible(
                            page,
                            ['input[name="otp"]', "#otp", 'input[autocomplete="one-time-code"]'],
                            totp_code,
                            "otp",
                        )
                        await page.click('button[type="submit"], input[type="submit"]')
                        await page.wait_for_load_state("networkidle")

                    # ── Phase 3: Profile selection ────────────────────────────────
                    if await page.locator("text=Seleção de perfil").count() > 0:
                        profiles = await _extract_profiles(page)
                        if not profiles:
                            raise RuntimeError(
                                "Tela de selecao de perfil eProc sem perfis extraiveis; "
                                f"clickables={await _visible_clickables(page)}"
                            )
                        await update_phase(
                            conn, setup_id, "waiting_profile", available_profiles=profiles
                        )
                        if preferred_profile and _profile_matches_available(preferred_profile, profiles):
                            log.info(
                                "eProc setup %s: selecting preferred profile %s",
                                setup_id,
                                preferred_profile,
                            )
                            selected = preferred_profile
                        else:
                            log.info("eProc setup %s: waiting for profile selection", setup_id)
                            selected = await poll_for_field(
                                conn, setup_id, "selected_profile", timeout_seconds=300
                            )

                        await _click_profile(page, selected, profiles)
                        await page.wait_for_load_state("networkidle")

                    # ── Phase 4: Save session ─────────────────────────────────────
                    await update_phase(conn, setup_id, "saving")
                    await _ensure_authenticated_eproc(page)
                    storage_state = await context.storage_state()
                    session_json = json.dumps(storage_state)
                    encrypted = encrypt_session(client_id, session_json)
                    await save_session(conn, setup_id, encrypted)
                    log.info("eProc setup %s: completed", setup_id)
                    return SetupResult(status="completed", setup_id=setup_id)

                finally:
                    await context.close()
                    await browser.close()
        except Exception as exc:
            msg = str(exc)
            log.exception("eProc setup %s failed", setup_id)
            await update_phase(conn, setup_id, "failed", error_message=msg)
            return SetupResult(status="failed", setup_id=setup_id, error=msg)
    finally:
        await conn.close()


async def _extract_profiles(page: Page) -> list[dict[str, str]]:
    profiles: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_profile(sigla: str, descricao: str) -> None:
        sigla = " ".join(sigla.split())
        descricao = " ".join(descricao.split())
        if not sigla or sigla in seen:
            return
        seen.add(sigla)
        profiles.append({"sigla": sigla, "descricao": descricao or sigla})

    rows = await page.locator("table tr").all()
    for row in rows:
        cells = await row.locator("td").all()
        if len(cells) >= 2:
            sigla = (await cells[0].text_content() or "").strip()
            descricao = (await cells[1].text_content() or "").strip()
            add_profile(sigla, descricao)

    clickables = await page.locator("a, button, input[type=button], input[type=submit]").all()
    for clickable in clickables:
        if not await clickable.is_visible():
            continue
        text = (await clickable.text_content() or "").strip()
        value = (await clickable.get_attribute("value") or "").strip()
        label = text or value
        if not label:
            continue
        profile = _parse_profile_label(label)
        if profile:
            add_profile(profile, profile)

    return profiles


def _parse_profile_label(label: str) -> str | None:
    normalized = " ".join(label.split())
    marker = "Definir como padrão"
    if marker not in normalized:
        return None
    normalized = normalized.replace(marker, "").strip()
    match = re.fullmatch(r"([A-Z]{2}\d+)([A-ZÀ-Ú]+)", normalized)
    if match:
        return f"{match.group(1)} {match.group(2)}"
    return normalized or None


def _profile_key(value: str) -> str:
    return re.sub(r"[^0-9A-ZÀ-Ú]", "", value.upper())


def _profile_matches_available(profile: str, profiles: list[dict[str, str]]) -> bool:
    wanted = _profile_key(profile)
    for item in profiles:
        sigla = item["sigla"]
        descricao = item["descricao"]
        keys = {
            _profile_key(sigla),
            _profile_key(descricao),
            _profile_key(f"{sigla} {descricao}"),
        }
        if wanted in keys:
            return True
    return False


async def _click_profile(page: Page, selected: str, profiles: list[dict[str, str]]) -> None:
    wanted = _profile_key(selected)

    clickables = await page.locator("a, button, input[type=button], input[type=submit]").all()
    for clickable in clickables:
        if not await clickable.is_visible():
            continue
        text = (await clickable.text_content() or "").strip()
        value = (await clickable.get_attribute("value") or "").strip()
        label = text or value
        profile = _parse_profile_label(label)
        if profile and _profile_key(profile) == wanted:
            await clickable.click()
            return

    rows = await page.locator("tr").all()
    for row in rows:
        if not await row.is_visible():
            continue
        row_text = " ".join(((await row.text_content()) or "").split())
        if wanted and wanted in _profile_key(row_text):
            action = row.locator("a, button, input[type=button], input[type=submit]").first
            if await action.count() > 0 and await action.is_visible():
                await action.click()
            else:
                await row.click()
            return

    cells = await page.locator("td").all()
    for cell in cells:
        if not await cell.is_visible():
            continue
        cell_text = " ".join(((await cell.text_content()) or "").split())
        if wanted and wanted in _profile_key(cell_text):
            await cell.click()
            return

    raise RuntimeError(
        f"Perfil eProc selecionado nao encontrado na tela: {selected}; perfis={profiles}; "
        f"clickables={await _visible_clickables(page)}"
    )


async def _ensure_authenticated_eproc(page: Page) -> None:
    await page.goto(f"{EPROC_BASE}/externo_controlador.php")
    await page.wait_for_load_state("networkidle")
    if "sso.tjsc.jus.br" in page.url or "login" in page.url.lower():
        raise RuntimeError("Sessao eProc nao autenticada apos setup; refaca o login/2FA")


async def _visible_clickables(page: Page) -> list[dict[str, str | None]]:
    elements = await page.locator("a, button, input[type=button], input[type=submit]").all()
    result: list[dict[str, str | None]] = []
    for element in elements[:30]:
        if not await element.is_visible():
            continue
        result.append(
            {
                "tag": await element.evaluate("e => e.tagName.toLowerCase()"),
                "id": await element.get_attribute("id"),
                "name": await element.get_attribute("name"),
                "className": await element.get_attribute("class"),
                "text": " ".join(((await element.text_content()) or "").split())[:120],
                "value": await element.get_attribute("value"),
            }
        )
    return result


async def _fill_first_visible(
    page: Page,
    selectors: list[str],
    value: str,
    field_name: str,
) -> None:
    for selector in selectors:
        candidates = page.locator(selector)
        try:
            await candidates.first.wait_for(state="visible", timeout=3000)
        except Exception:
            pass
        count = await candidates.count()
        for index in range(count):
            candidate = candidates.nth(index)
            if await candidate.is_visible() and await candidate.is_enabled() and await candidate.is_editable():
                await candidate.click()
                await candidate.fill(value)
                return
    visible_inputs = await page.locator("input").evaluate_all(
        """elements => elements.map((e) => {
            const r = e.getBoundingClientRect();
            const s = getComputedStyle(e);
            return {
                id: e.id || null,
                name: e.getAttribute("name"),
                type: e.getAttribute("type"),
                className: e.className || null,
                display: s.display,
                visibility: s.visibility,
                width: Math.round(r.width),
                height: Math.round(r.height),
            };
        })"""
    )
    raise RuntimeError(
        f"Campo visivel/editavel nao encontrado no login eProc: {field_name}; inputs={visible_inputs}"
    )
