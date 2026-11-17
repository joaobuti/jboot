from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from contextlib import suppress
from typing import Any, Awaitable, TypeVar, cast
from urllib.parse import urljoin

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError, async_playwright

from ..base import BasePortalAdapter
from ...shared.contracts import ConsultaInput, ProcessoEncontrado
from ...shared.errors import AuthExpiredError, PortalUnavailableError
from .parser import parse_eproc_results

log = logging.getLogger(__name__)

EPROC_BASE = "https://eproc1g.tjsc.jus.br/eproc"
TIMEOUT_MS = int(os.getenv("PORTAL_TIMEOUT_MS", "30000"))
OPERATION_TIMEOUT_SECONDS = int(os.getenv("EPROC_OPERATION_TIMEOUT_SECONDS", "180"))

T = TypeVar("T")


async def _bounded_portal_operation(operation: str, awaitable: Awaitable[T]) -> T:
    try:
        return await asyncio.wait_for(awaitable, timeout=OPERATION_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        raise PortalUnavailableError(
            f"eProc operation timed out after {OPERATION_TIMEOUT_SECONDS}s: {operation}"
        ) from exc


async def _close_playwright_resource(resource: Any, label: str) -> None:
    try:
        await asyncio.wait_for(resource.close(), timeout=10)
    except Exception:
        log.exception("Falha ao fechar recurso Playwright: %s", label)


class EprocTjscAdapter(BasePortalAdapter):
    portal_id = "eproc"
    base_url = EPROC_BASE
    auth_strategy = None  # type: ignore[assignment]
    parser = None  # type: ignore[assignment]

    async def execute(self, input: ConsultaInput) -> list[ProcessoEncontrado]:
        if not input.session_state_json:
            raise AuthExpiredError("eProc session not configured — run setup first")

        session_state = json.loads(input.session_state_json)

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(storage_state=session_state)
            try:
                page = await context.new_page()
                page.set_default_timeout(TIMEOUT_MS)

                await page.goto(f"{EPROC_BASE}/externo_controlador.php")
                await page.wait_for_load_state("networkidle")

                if "sso.tjsc.jus.br" in page.url or "login" in page.url.lower():
                    raise AuthExpiredError("eProc session expired — run setup again")

                raw = await _bounded_portal_operation(
                    f"single-consult:{input.query_value}",
                    self.fetch(page, input),
                )
                return parse_eproc_results(raw)  # type: ignore[arg-type]
            finally:
                await _close_playwright_resource(context, "context")
                await _close_playwright_resource(browser, "browser")

    async def execute_batch(self, inputs: list[ConsultaInput], enrich_details: bool = False) -> list[dict[str, Any]]:
        if not inputs:
            return []

        session_state_json = inputs[0].session_state_json
        if not session_state_json:
            raise AuthExpiredError("eProc session not configured — run setup first")

        session_state = json.loads(session_state_json)
        results: list[dict[str, Any]] = []

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = await browser.new_context(storage_state=session_state)
            try:
                page = await context.new_page()
                page.set_default_timeout(TIMEOUT_MS)

                await page.goto(f"{EPROC_BASE}/externo_controlador.php")
                await page.wait_for_load_state("networkidle")
                if "sso.tjsc.jus.br" in page.url or "login" in page.url.lower():
                    raise AuthExpiredError("eProc session expired — run setup again")

                for input_data in inputs:
                    try:
                        await page.goto(f"{EPROC_BASE}/externo_controlador.php")
                        await page.wait_for_load_state("networkidle")

                        raw = await _bounded_portal_operation(
                            f"batch-consult:{input_data.query_value}",
                            self.fetch(page, input_data, enrich_details=enrich_details),
                        )
                        processos = parse_eproc_results(raw)  # type: ignore[arg-type]
                        results.append(
                            {
                                "cpf": input_data.query_value,
                                "status": "success",
                                "processes": [
                                    {
                                        "numero": p.numero,
                                        "tribunal": p.tribunal,
                                        "assunto": p.assunto,
                                        "data_distribuicao": p.data_distribuicao,
                                        **p.raw,
                                    }
                                    for p in processos
                                ],
                            }
                        )
                    except AuthExpiredError:
                        raise
                    except Exception as exc:
                        results.append(
                            {
                                "cpf": input_data.query_value,
                                "status": "error",
                                "error": str(exc),
                                "processes": [],
                            }
                        )
            finally:
                await _close_playwright_resource(context, "context")
                await _close_playwright_resource(browser, "browser")

        return results

    async def fetch(self, page: object, input: ConsultaInput, enrich_details: bool = True) -> list[dict[object, object]]:
        p = cast(Page, page)
        cpf = "".join(c for c in input.query_value if c.isdigit())
        last_error: Exception | None = None

        for attempt in range(1, 4):
            if attempt > 1:
                await p.wait_for_timeout(5_000)

            try:
                await self._open_consult_form(p)
                data = await self._submit_cpf_search(p, cpf)
                return await self._collect_all_result_pages(p, data, enrich_details=enrich_details)
            except (PlaywrightTimeoutError, PortalUnavailableError) as exc:
                last_error = exc
                if attempt == 3:
                    break
                log.warning("Tentativa %s/3 falhou em consulta eProc: %s", attempt, exc)

        raise PortalUnavailableError(
            "eProc nao retornou resultado consultavel apos 3 tentativas; "
            f"ultimo_erro={last_error}; {await self._page_diagnostic(p)}"
        )

    async def _open_consult_form(self, page: Page) -> None:
        await page.goto(f"{EPROC_BASE}/externo_controlador.php")
        await page.wait_for_load_state("networkidle")
        if "sso.tjsc.jus.br" in page.url or "login" in page.url.lower():
            raise AuthExpiredError("eProc session expired — run setup again")

        try:
            await page.click("text=Consulta Processual", timeout=5_000)
            await page.click("text=Consultar Processos", timeout=5_000)
        except PlaywrightTimeoutError as exc:
            raise AuthExpiredError(
                f"eProc session expired or did not show authenticated menu; {await self._page_diagnostic(page)}"
            ) from exc
        await page.wait_for_selector("#selTipoPesquisa", timeout=10_000)

    async def _submit_cpf_search(self, page: Page, cpf: str) -> Any:
        await self._prepare_cpf_search(page)
        await self._fill_visible_enabled(page, 'input[name="strDocParte"]', cpf, "CPF")

        cb = page.locator('input[name="chkExibirBaixados"]')
        if not await cb.is_checked():
            await cb.check()

        data: Any = {"resultados": []}
        try:
            async with page.expect_response(
                lambda r: "controlador_ajax.php" in r.url
                and "processos_consulta_por_documento_identificacao" in r.url,
                timeout=15_000,
            ) as resp_info:
                await self._click_visible_consult_button(page)

            resp = await resp_info.value
            if not resp.ok:
                raise PortalUnavailableError(f"eProc AJAX returned HTTP {resp.status}")
            data = await self._safe_response_json(resp)
        except PlaywrightTimeoutError:
            try:
                await page.wait_for_selector("#divInfraAreaTabela", timeout=10_000)
            except PlaywrightTimeoutError as exc:
                raise PortalUnavailableError(
                    "eProc nao exibiu a tabela de resultados apos consultar documento; "
                    f"{await self._page_diagnostic(page)}"
                ) from exc

        return data

    async def _collect_all_result_pages(self, page: Page, initial_data: Any, enrich_details: bool = True) -> list[dict[object, object]]:
        collected: dict[str, dict[object, object]] = {}

        def add_results(payload: Any) -> None:
            if not isinstance(payload, dict):
                return
            resultados = payload.get("resultados")
            if not isinstance(resultados, list):
                return
            for item in resultados:
                if not isinstance(item, dict):
                    continue
                key = str(item.get("nr_processo") or item.get("id") or len(collected))
                collected[key] = item

        add_results(initial_data)
        await self._add_client_side_datatable_results(page, add_results)

        await self._try_set_results_per_page(page, "100", add_results)
        await self._add_client_side_datatable_results(page, add_results)

        next_button = page.locator("#divInfraAreaTabela_next")
        for _ in range(50):
            if await next_button.count() == 0:
                break
            classes = await next_button.get_attribute("class") or ""
            if "disabled" in classes:
                break

            try:
                async with page.expect_response(
                    lambda r: "controlador_ajax.php" in r.url
                    and "processos_consulta_por_documento_identificacao" in r.url,
                    timeout=5_000,
                ) as resp_info:
                    await next_button.locator("a").click()

                resp = await resp_info.value
                if not resp.ok:
                    raise PortalUnavailableError(f"eProc AJAX pagination returned HTTP {resp.status}")
                add_results(await self._safe_response_json(resp))
            except Exception:
                await page.wait_for_timeout(250)

            await self._add_client_side_datatable_results(page, add_results)

        results = list(collected.values())
        if enrich_details:
            await self._enrich_results_with_detail_parties(page, results)
        else:
            for item in results:
                item["parties"] = self._fallback_parties_from_result(item)
        return results

    async def enrich_processes(self, session_state_json: str, processes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not session_state_json:
            raise AuthExpiredError("eProc session not configured — run setup first")

        session_state = json.loads(session_state_json)
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = await browser.new_context(storage_state=session_state)
            try:
                page = await context.new_page()
                page.set_default_timeout(TIMEOUT_MS)
                await page.goto(f"{EPROC_BASE}/externo_controlador.php")
                await page.wait_for_load_state("networkidle")
                if "sso.tjsc.jus.br" in page.url or "login" in page.url.lower():
                    raise AuthExpiredError("eProc session expired — run setup again")

                await _bounded_portal_operation(
                    "enrich-processes",
                    self._enrich_results_with_detail_parties(page, processes),  # type: ignore[arg-type]
                )
                return processes
            finally:
                await _close_playwright_resource(context, "context")
                await _close_playwright_resource(browser, "browser")

    async def _enrich_results_with_detail_parties(self, page: Page, results: list[dict[object, object]]) -> None:
        for item in results:
            detail_url = self._detail_url_from_result(item)
            if not detail_url:
                item["parties"] = []
                continue

            detail_page = await page.context.new_page()
            try:
                detail_page.set_default_timeout(TIMEOUT_MS)
                await detail_page.goto(detail_url)
                await detail_page.wait_for_load_state("domcontentloaded")
                item["parties"] = await self._extract_parties(detail_page)
            except Exception as exc:
                log.warning("Falha ao extrair partes do processo %s: %s", item.get("nr_processo"), exc)
                item["parties"] = []
            finally:
                with suppress(Exception):
                    await asyncio.wait_for(detail_page.close(), timeout=10)

            if not item["parties"]:
                item["parties"] = self._fallback_parties_from_result(item)

    def _detail_url_from_result(self, item: dict[object, object]) -> str | None:
        candidates = [
            item.get("linkProcessoAssinado"),
            item.get("link"),
            item.get("nr_processo"),
        ]
        for candidate in candidates:
            if not isinstance(candidate, str) or not candidate:
                continue
            href_match = re.search(r'href=["\']([^"\']+)["\']', candidate)
            href = href_match.group(1) if href_match else candidate
            if "processo_selecionar" in href:
                return urljoin(f"{EPROC_BASE}/", href.replace("&amp;", "&"))
        return None

    def _fallback_parties_from_result(self, item: dict[object, object]) -> list[dict[str, Any]]:
        parties: list[dict[str, Any]] = []
        autor = self._strip_html(str(item.get("autor") or ""))
        reu = self._strip_html(str(item.get("reu") or ""))
        if autor:
            parties.append({"role": "autor", "label": "AUTOR", "name": autor, "text": autor, "source": "result_row"})
        if reu:
            parties.append({"role": "reu", "label": "RÉU", "name": reu, "text": reu, "source": "result_row"})
        return parties

    def _strip_html(self, text: str) -> str:
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        return re.sub(r"\s+", " ", text).strip().rstrip(",").strip()

    async def _extract_parties(self, page: Page) -> list[dict[str, Any]]:
        return await page.evaluate(
            """() => {
                const normalize = (value) => (value || '')
                    .replace(/\\.item-barra-atributos-parte\\s*\\{[^}]*\\}/g, '')
                    .replace(/\\u00a0/g, ' ')
                    .replace(/\\s+/g, ' ')
                    .trim();
                const roleKey = (value) => {
                    const clean = normalize(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
                    if (['autor', 'exequente', 'requerente', 'demandante'].includes(clean)) return 'autor';
                    if (['reu', 'executado', 'requerido', 'demandado'].includes(clean)) return 'reu';
                    return clean || null;
                };
                const cleanPartyName = (value) => normalize(value).replace(/\\s+-\\s+Cita(?:ç|c)[aã]o.*$/i, '').trim();
                const documentDigits = (value) => normalize(value).replace(/\\D/g, '');
                const representativeType = (anchor) => {
                    let node = anchor.nextSibling;
                    while (node) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('sr-only')) {
                            const match = normalize(node.textContent).match(/Tipo de Usu[aá]rio:\\s*(.+)$/i);
                            return match ? normalize(match[1]) : null;
                        }
                        if (node.nodeName === 'BR') return null;
                        node = node.nextSibling;
                    }
                    return null;
                };
                const representativeName = (anchor) => {
                    let node = anchor.previousSibling;
                    while (node) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = normalize(node.textContent);
                            if (text) return text;
                        }
                        if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'BR') {
                            const text = normalize(node.textContent);
                            if (text && !/Tipo de Usu[aá]rio|Copiar CPF|Pessoa F[ií]sica|Entidade/i.test(text)) return text;
                        }
                        node = node.previousSibling;
                    }
                    return '';
                };
                const headerFor = (cell, index) => {
                    const table = cell.closest('table');
                    const row = cell.closest('tr');
                    if (!table || !row) return '';
                    const headerRows = Array.from(table.querySelectorAll('tr')).filter((candidate) => candidate.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
                    const headers = Array.from((headerRows.at(-1) || table.querySelector('tr') || table).querySelectorAll('th'));
                    return normalize(headers[index]?.textContent || '');
                };

                const cells = Array.from(document.querySelectorAll('td.autorReu'));
                if (cells.length > 0) {
                    return cells.map((cell, index) => {
                        const partyEl = cell.querySelector('.infraNomeParte');
                        const dataParte = normalize(partyEl?.getAttribute('data-parte') || '');
                        const header = headerFor(cell, index);
                        const label = header || dataParte || (index === 0 ? 'AUTOR' : index === 1 ? 'RÉU' : `PARTE ${index + 1}`);
                        const docEl = cell.querySelector('[id^="spnCpfParte"]');
                        const text = normalize(cell.textContent);
                        const personTypeMatch = text.match(/-\\s*(Pessoa\\s+F[ií]sica|Pessoa\\s+Jur[ií]dica|Entidade)\\b/i);
                        const representatives = Array.from(cell.querySelectorAll('a')).map((anchor) => ({
                            name: representativeName(anchor),
                            registration: normalize(anchor.textContent),
                            type: representativeType(anchor),
                        })).filter((rep) => rep.name || rep.registration);
                        return {
                            role: roleKey(dataParte || label) || (index === 0 ? 'autor' : 'reu'),
                            label: normalize(label).toUpperCase(),
                            name: cleanPartyName(partyEl?.getAttribute('aria-label') || partyEl?.textContent || ''),
                            document: normalize(docEl?.textContent || ''),
                            document_digits: documentDigits(docEl?.textContent || ''),
                            person_type: personTypeMatch ? normalize(personTypeMatch[1]) : null,
                            representatives,
                            text,
                            source: 'detail_page',
                        };
                    }).filter((party) => party.name);
                }

                const result = [];
                const headings = Array.from(document.querySelectorAll('legend, caption, h3, h4, strong, b'));
                const sectionHeading = headings.find((el) => normalize(el.textContent).toLowerCase().includes('partes e representantes'));
                const root = sectionHeading
                    ? (sectionHeading.closest('fieldset, div, section') || sectionHeading.parentElement || document)
                    : document;
                const table = Array.from(root.querySelectorAll('table')).find((candidate) =>
                    normalize(candidate.textContent).toLowerCase().includes('autor')
                    || normalize(candidate.textContent).toLowerCase().includes('réu')
                    || normalize(candidate.textContent).toLowerCase().includes('exequente')
                    || normalize(candidate.textContent).toLowerCase().includes('executado')
                    || normalize(candidate.textContent).toLowerCase().includes('requerente')
                    || normalize(candidate.textContent).toLowerCase().includes('requerido')
                );
                if (!table) return result;

                const headers = Array.from(table.querySelectorAll('th')).map((th) => normalize(th.textContent).toLowerCase());
                const genericCells = Array.from(table.querySelectorAll('td'));
                genericCells.forEach((cell, index) => {
                    const role = headers[index] || (index === 0 ? 'autor' : index === 1 ? 'réu' : `coluna_${index + 1}`);
                    const text = normalize(cell.textContent);
                    if (!text) return;
                    const partyEl = cell.querySelector('.infraNomeParte');
                    const docEl = cell.querySelector('[id^="spnCpfParte"]');
                    const personTypeMatch = text.match(/-\\s*(Pessoa\\s+F[ií]sica|Pessoa\\s+Jur[ií]dica|Entidade)\\b/i);
                    const representatives = Array.from(cell.querySelectorAll('a')).map((anchor) => ({
                        name: representativeName(anchor),
                        registration: normalize(anchor.textContent),
                        type: representativeType(anchor),
                    })).filter((rep) => rep.name || rep.registration);
                    const badge = partyEl || cell.querySelector('.badge, span[class*="badge"], span[class*="infra"], a');
                    result.push({
                        role: roleKey(role) || role.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(),
                        label: role.toUpperCase(),
                        name: cleanPartyName(
                            partyEl?.getAttribute('aria-label')
                            || partyEl?.textContent
                            || (badge ? badge.textContent : text.split('(')[0])
                        ),
                        document: normalize(docEl?.textContent || ''),
                        document_digits: documentDigits(docEl?.textContent || ''),
                        person_type: personTypeMatch ? normalize(personTypeMatch[1]) : null,
                        representatives,
                        text,
                        source: 'detail_page',
                    });
                });
                return result;
            }"""
        )

    async def _add_client_side_datatable_results(self, page: Page, add_results: Any) -> None:
        try:
            rows = await page.evaluate(
                """() => {
                    const w = window;
                    if (!w.jQuery || !w.jQuery.fn || !w.jQuery.fn.dataTable) return [];
                    const table = w.jQuery('#divInfraAreaTabela').DataTable();
                    return table.rows({ search: 'applied' }).data().toArray();
                }"""
            )
            add_results({"resultados": rows})
        except Exception:
            return

    async def _try_set_results_per_page(self, page: Page, value: str, add_results: Any) -> None:
        selector = 'select[name="divInfraAreaTabela_length"]'
        length_select = page.locator(selector)
        if await length_select.count() == 0:
            return

        try:
            async with page.expect_response(
                lambda r: "controlador_ajax.php" in r.url
                and "processos_consulta_por_documento_identificacao" in r.url,
                timeout=5_000,
            ) as resp_info:
                await length_select.select_option(value)

            resp = await resp_info.value
            if resp.ok:
                add_results(await self._safe_response_json(resp))
        except Exception:
            # Some eProc/DataTables versions paginate client-side after the first AJAX payload.
            return

    async def _safe_response_json(self, response: Any) -> Any:
        try:
            return await response.json()
        except Exception as exc:
            log.warning("Resposta AJAX eProc indisponivel para leitura JSON: %s", exc)
            return {"resultados": []}

    async def _click_visible_consult_button(self, page: Page) -> None:
        candidates = page.locator(
            'input[type="submit"][value*="Consultar"], '
            'input[type="button"][value*="Consultar"], '
            'button:has-text("Consultar")'
        )
        for index in range(await candidates.count()):
            candidate = candidates.nth(index)
            if await candidate.is_visible() and await candidate.is_enabled():
                await candidate.click()
                return

        raise PortalUnavailableError("Botao visivel de consulta nao encontrado no eProc")

    async def _prepare_cpf_search(self, page: Page) -> None:
        for attempt in range(3):
            await page.select_option("#selTipoPesquisa", "CP")
            await page.locator("#selTipoPesquisa").evaluate(
                """select => {
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            try:
                await page.wait_for_load_state("networkidle", timeout=3_000)
            except PlaywrightTimeoutError:
                pass

            try:
                await self._wait_for_cpf_field(page)
                return
            except PlaywrightTimeoutError:
                if attempt == 0:
                    signed_url = await self._cpf_signed_form_url(page)
                    if signed_url:
                        await page.goto(signed_url)
                        await page.wait_for_load_state("networkidle")
                        try:
                            await self._wait_for_cpf_field(page)
                            return
                        except PlaywrightTimeoutError:
                            pass
                if attempt < 2:
                    await page.wait_for_timeout(1_000)
                    continue
                raise PortalUnavailableError(
                    "Campo CPF permaneceu desabilitado apos selecionar CPF/CNPJ no eProc; "
                    f"{await self._page_diagnostic(page)}"
                )

    async def _wait_for_cpf_field(self, page: Page) -> None:
        await page.wait_for_function(
            """() => {
                const input = document.querySelector('input[name="strDocParte"]');
                if (!input) return false;
                const style = window.getComputedStyle(input);
                return !input.disabled
                    && !input.readOnly
                    && style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && input.getBoundingClientRect().width > 0
                    && input.getBoundingClientRect().height > 0;
            }""",
            timeout=10_000,
        )

    async def _cpf_signed_form_url(self, page: Page) -> str | None:
        signed_path = await page.locator("#selTipoPesquisa option[value='CP']").evaluate(
            "option => option.getAttribute('data-acaoassinada')"
        )
        if not isinstance(signed_path, str) or not signed_path:
            return None
        return urljoin(f"{EPROC_BASE}/", signed_path.replace("&amp;", "&"))

    async def _fill_visible_enabled(self, page: Page, selector: str, value: str, label: str) -> None:
        candidates = page.locator(selector)
        for _ in range(100):
            for index in range(await candidates.count()):
                candidate = candidates.nth(index)
                if await candidate.is_visible() and await candidate.is_enabled() and await candidate.is_editable():
                    await candidate.fill(value)
                    return
            await asyncio.sleep(0.1)

        raise PortalUnavailableError(
            f"Campo visivel/editavel nao encontrado no eProc: {label}; "
            f"{await self._page_diagnostic(page)}"
        )

    async def _page_diagnostic(self, page: Page) -> str:
        try:
            title = await page.title()
            fields = await page.locator("#selTipoPesquisa, input[name='strDocParte'], #divInfraAreaTabela").evaluate_all(
                """elements => elements.map((e) => {
                    const r = e.getBoundingClientRect();
                    const s = getComputedStyle(e);
                    return {
                        tag: e.tagName.toLowerCase(),
                        id: e.id || null,
                        name: e.getAttribute('name'),
                        value: e.value || null,
                        disabled: Boolean(e.disabled),
                        readonly: Boolean(e.readOnly),
                        display: s.display,
                        visibility: s.visibility,
                        width: Math.round(r.width),
                        height: Math.round(r.height),
                    };
                })"""
            )
            return f"url={page.url}; title={title}; fields={fields}"
        except Exception as exc:
            return f"url={page.url}; diagnostic_error={exc}"
