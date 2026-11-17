#!/usr/bin/env python3
"""Build the HTTP contract graph between services and report consumer/provider drift."""

from __future__ import annotations

import argparse
from bisect import bisect_left
from dataclasses import dataclass, field
import fnmatch
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = Path("tools/ai/api-graph.yaml")
DEFAULT_OUTPUT = Path("tmp/ai/api-graph.json")
SCHEMA_VERSION = "1.0.0"
PARAM = ":param"
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
SEVERITY_RANK = {"error": 0, "warning": 1, "info": 2}
SKIP_DIRS = {"node_modules", ".next", "dist", "coverage", "vendor", ".venv", "venv", "__pycache__", "site-packages", ".git"}
EXTENSIONS = {
    "typescript": {".ts", ".tsx", ".js", ".jsx", ".mjs"},
    "python": {".py"},
    "php": {".php"},
    "go": {".go"},
}
IDENT = r"[A-Za-z_$][\w$]*"
IDENT_RE = re.compile(IDENT)
QUERY_HINT_RE = re.compile(r"(?i)query|qs|search|param|filter|string")


# --------------------------------------------------------------------------- model


@dataclass
class Route:
    service: str
    method: str
    path: str
    segments: tuple[str, ...]
    file: str
    line: int
    handler: str | None
    module: str | None
    request_type: str | None = None
    response_type: str | None = None
    consumers: list[str] = field(default_factory=list)


@dataclass
class Call:
    consumer: str
    file: str
    line: int
    via: str
    method: str | None
    status: str
    path: str | None = None
    segments: tuple[str, ...] | None = None
    services: tuple[str, ...] = ()
    reason: str | None = None
    response_type: str | None = None
    route: Route | None = None


@dataclass
class Finding:
    severity: str
    kind: str
    message: str
    file: str | None = None
    line: int | None = None
    service: str | None = None
    method: str | None = None
    path: str | None = None
    accepted: dict[str, Any] | None = None


@dataclass
class AcceptedEntry:
    kind: str
    category: str
    reason: str
    reference: str | None
    key: tuple[str, str, str, str]
    line: int
    matched: int = 0


class LineIndex:
    def __init__(self, text: str) -> None:
        self._breaks = [index for index, char in enumerate(text) if char == "\n"]

    def line(self, offset: int) -> int:
        return bisect_left(self._breaks, offset) + 1


def blank(chars: list[str], start: int, end: int) -> None:
    for index in range(start, end):
        if chars[index] != "\n":
            chars[index] = " "


def skip_space(text: str, index: int) -> int:
    while index < len(text) and text[index] in " \t\r\n":
        index += 1
    return index


def short(text: str, limit: int = 60) -> str:
    compact = " ".join(text.split())
    return compact if len(compact) <= limit else compact[: limit - 3] + "..."


def module_of(relative: str) -> str | None:
    match = re.search(r"/modules/([^/]+)/", relative)
    return match.group(1) if match else None


# --------------------------------------------------------------------------- paths


def split_provider_path(*pieces: str) -> list[tuple[str, ...]]:
    """Join provider path pieces; optional Laravel params yield one variant per presence."""
    variants: list[list[str]] = [[]]
    for piece in pieces:
        for raw in piece.split("/"):
            segment = raw.strip()
            if not segment:
                continue
            if re.fullmatch(r"\{[^}]*\?\}", segment):
                variants = [variant + [PARAM] for variant in variants] + [list(variant) for variant in variants]
                continue
            if segment.startswith(":") or segment == "*" or re.fullmatch(r"\{[^}]*\}", segment):
                segment = PARAM
            variants = [variant + [segment] for variant in variants]
    unique = []
    for variant in variants:
        key = tuple(variant)
        if key not in unique:
            unique.append(key)
    return unique


def render_path(segments: tuple[str, ...]) -> str:
    return "/" + "/".join(segments)


def relative_segments(parts: list[tuple[str, str]]) -> tuple[tuple[str, ...] | None, str | None]:
    """Normalize consumer path parts (base already removed) into route segments."""
    if not parts:
        return (), None
    if parts[0][0] == "expr":
        return None, f"path starts with runtime expression `{short(parts[0][1])}`"
    sentinel = "\0"
    expressions: list[str] = []
    rendered = []
    for kind, value in parts:
        if kind == "lit":
            rendered.append(value)
        else:
            expressions.append(value)
            rendered.append(sentinel)
    text = "".join(rendered)
    cut = [position for position in (text.find("?"), text.find("#")) if position != -1]
    if cut:
        text = text[: min(cut)]
    raw_segments = [segment for segment in text.split("/") if segment]
    segments: list[str] = []
    expression_index = 0
    for position, segment in enumerate(raw_segments):
        count = segment.count(sentinel)
        if count == 0:
            segments.append(segment)
            continue
        glued = segment.rstrip(sentinel)
        expression = expressions[expression_index + count - 1] if expression_index + count - 1 < len(expressions) else ""
        expression_index += count
        is_last = position == len(raw_segments) - 1
        if is_last and count == 1 and glued and sentinel not in glued and is_query_suffix(expression):
            segments.append(glued)
        else:
            segments.append(PARAM)
    return tuple(segments), None


def is_query_suffix(expression: str) -> bool:
    """A glued trailing interpolation is a query suffix when every string branch starts a query."""
    branches = ts_ternary_branches(expression)
    literals = []
    for branch in branches:
        parts = ts_string_parts(branch) or []
        if parts and parts[0][0] == "lit":
            literals.append(parts[0][1])
        elif parts == [] or (parts and parts[0][0] == "expr" and len(branches) > 1):
            return False
    if len(branches) > 1 and len(literals) == len(branches):
        return all(value == "" or value[0] in "?&#" for value in literals)
    return bool(QUERY_HINT_RE.search(expression))


def path_score(call: tuple[str, ...], route: tuple[str, ...]) -> int | None:
    if len(call) != len(route):
        return None
    score = 0
    for left, right in zip(call, route):
        if left == right:
            score += 1 if left == PARAM else 2
        elif left != PARAM and right != PARAM:
            return None
    return score


def merge_parts(*groups: list[tuple[str, str]]) -> list[tuple[str, str]]:
    merged: list[tuple[str, str]] = []
    for group in groups:
        for kind, value in group:
            if merged and kind == "lit" and merged[-1][0] == "lit":
                merged[-1] = ("lit", merged[-1][1] + value)
            elif not (kind == "lit" and value == ""):
                merged.append((kind, value))
    return merged


# --------------------------------------------------------------------------- typescript lexing

OPENERS = {"(": ")", "[": "]", "{": "}"}
CLOSERS = set(OPENERS.values())
REGEX_PRECEDERS = set("(,=:[!&|?{};+-*%<>~^")
REGEX_KEYWORDS = {"return", "typeof", "case", "do", "else", "in", "of", "yield", "await", "void", "delete", "throw"}
TS_CONTROL = {
    "if", "for", "while", "switch", "catch", "with", "return", "typeof", "await", "new", "import",
    "export", "else", "do", "in", "of", "void", "delete", "throw", "case", "yield", "super",
}
TS_TYPE_WORDS = {"void", "string", "number", "boolean", "any", "unknown", "never", "object", "async"}
TS_ENV_RE = re.compile(r"process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\])")
ARROW_NAME_RE = re.compile(rf"({IDENT})\s*(?::[^=;{{}}()]*)?[=:]\s*(?:async\s*)?(?:<[^<>]*>\s*)?$")
SINGLE_ARROW_RE = re.compile(rf"(?<![\w$.])({IDENT})\s*=>")
CONST_RE = re.compile(rf"(?<![\w$.])(?:const|let|var)\s+({IDENT})\s*(?::[^=;]+)?=(?![=>])\s*")
PROP_RE = re.compile(rf"(?:readonly|public|private|protected|static)\s+(?:readonly\s+)?({IDENT})\s*(?::[^=;(]+)?=(?![=>])\s*")
OBJECT_PROP_RE = re.compile(rf"(?m)^[ \t]*({IDENT})\s*:\s*([^\n]*process\.env[^\n]*)")
PARAM_PREFIX_RE = re.compile(r"^(?:@\w+\s*(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|readonly|override)\s+)*")
STRING_METHOD_RE = re.compile(r"\??\.\s*(?:replace|replaceAll|trim|trimEnd|trimStart|toString)\s*\(")


def ts_env_names(text: str) -> set[str]:
    return {left or right for left, right in TS_ENV_RE.findall(text)}


def ts_unwrap(expression: str) -> str:
    """Remove wrappers that do not change the URL value: parens, new URL(x), toString(), href, casts."""
    expression = expression.strip()
    while True:
        previous = expression
        while expression.startswith("(") and ts_skip_balanced(expression, 0) == len(expression):
            expression = expression[1:-1].strip()
        constructed = re.match(r"new\s+URL\s*\(", expression)
        if constructed and ts_skip_balanced(expression, constructed.end() - 1) == len(expression):
            arguments = ts_split_top_level(expression[constructed.end():-1])
            if arguments:
                expression = arguments[0].strip()
        if not expression.startswith(("`", "'", '"')):
            for method in STRING_METHOD_RE.finditer(expression):
                if ts_skip_balanced(expression, method.end() - 1) == len(expression):
                    expression = expression[:method.start()].strip()
                    break
            expression = re.sub(r"\s*\??\.\s*href$", "", expression)
            expression = re.sub(r"\s+as\s+[\w.$<>\[\]| ]+$", "", expression)
        if expression == previous:
            return expression


def ts_skip_quoted(text: str, start: int) -> int:
    quote = text[start]
    index = start + 1
    while index < len(text):
        char = text[index]
        if char == "\\":
            index += 2
        elif char == quote:
            return index + 1
        elif char == "\n":
            return index
        else:
            index += 1
    return len(text)


def ts_skip_template(text: str, start: int) -> int:
    index = start + 1
    while index < len(text):
        char = text[index]
        if char == "\\":
            index += 2
        elif char == "`":
            return index + 1
        elif text.startswith("${", index):
            index = ts_skip_balanced(text, index + 1)
        else:
            index += 1
    return len(text)


def ts_skip_balanced(text: str, start: int) -> int:
    expected = [OPENERS[text[start]]]
    index = start + 1
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
            continue
        if char == "`":
            index = ts_skip_template(text, index)
            continue
        if char in OPENERS:
            expected.append(OPENERS[char])
        elif char in CLOSERS and char == expected[-1]:
            expected.pop()
            if not expected:
                return index + 1
        index += 1
    return len(text)


def ts_regex_allowed(text: str, slash: int) -> bool:
    index = slash - 1
    while index >= 0 and text[index] in " \t\r\n":
        index -= 1
    if index < 0:
        return True
    char = text[index]
    if char in REGEX_PRECEDERS:
        return True
    if char.isalnum() or char in "_$":
        end = index + 1
        while index >= 0 and (text[index].isalnum() or text[index] in "_$"):
            index -= 1
        return text[index + 1:end] in REGEX_KEYWORDS
    return False


def ts_skip_regex(text: str, slash: int) -> int:
    index = slash + 1
    in_class = False
    while index < len(text):
        char = text[index]
        if char == "\n":
            return slash + 1
        if char == "\\":
            index += 2
            continue
        if char == "[":
            in_class = True
        elif char == "]":
            in_class = False
        elif char == "/" and not in_class:
            index += 1
            while index < len(text) and text[index].isalpha():
                index += 1
            return index
        index += 1
    return slash + 1


def ts_strip_comments(text: str) -> str:
    chars = list(text)
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
        elif char == "`":
            index = ts_skip_template(text, index)
        elif text.startswith("//", index):
            end = text.find("\n", index)
            end = len(text) if end == -1 else end
            blank(chars, index, end)
            index = end
        elif text.startswith("/*", index):
            end = text.find("*/", index + 2)
            end = len(text) if end == -1 else end + 2
            blank(chars, index, end)
            index = end
        elif char == "/" and ts_regex_allowed(text, index):
            index = ts_skip_regex(text, index)
        else:
            index += 1
    return "".join(chars)


def ts_code_positions(text: str, targets: str) -> list[int]:
    positions = []
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
            continue
        if char == "`":
            index = ts_skip_template(text, index)
            continue
        if char in targets:
            positions.append(index)
        index += 1
    return positions


def ts_split_top_level(text: str, separator: str = ",") -> list[str]:
    parts = []
    depth = 0
    start = 0
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
            continue
        if char == "`":
            index = ts_skip_template(text, index)
            continue
        if char in OPENERS:
            depth += 1
        elif char in CLOSERS:
            depth -= 1
        elif depth == 0 and text.startswith(separator, index):
            parts.append(text[start:index])
            index += len(separator)
            start = index
            continue
        index += 1
    tail = text[start:]
    if tail.strip() or parts:
        parts.append(tail)
    return parts


def ts_ternary_branches(expression: str) -> list[str]:
    depth = 0
    question = None
    index = 0
    while index < len(expression):
        char = expression[index]
        if char in "'\"":
            index = ts_skip_quoted(expression, index)
            continue
        if char == "`":
            index = ts_skip_template(expression, index)
            continue
        if char in OPENERS:
            depth += 1
        elif char in CLOSERS:
            depth -= 1
        elif depth == 0 and char == "?" and question is None:
            following = expression[index + 1] if index + 1 < len(expression) else ""
            preceding = expression[index - 1] if index else ""
            if following not in ".?" and preceding != "?":
                question = index
        elif depth == 0 and char == ":" and question is not None:
            return ts_ternary_branches(expression[question + 1:index]) + ts_ternary_branches(expression[index + 1:])
        index += 1
    return [expression.strip()]


def ts_expression_end(text: str, start: int) -> int:
    index = start
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
            continue
        if char == "`":
            index = ts_skip_template(text, index)
            continue
        if char in OPENERS:
            index = ts_skip_balanced(text, index)
            continue
        if char in CLOSERS or char in ",;":
            return index
        index += 1
    return len(text)


def ts_skip_type(text: str, start: int) -> int | None:
    """Scan a type annotation; return index of the body `{` or `=>` that follows it."""
    depth = 0
    last = ":"
    index = start
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
            last = "'"
            continue
        if char == "`":
            index = ts_skip_template(text, index)
            last = "`"
            continue
        if text.startswith("=>", index):
            if depth == 0:
                return index
            index += 2
            last = ">"
            continue
        if char == "{" and depth == 0 and last not in ":|&<,(":
            return index
        if char in "([{<":
            depth += 1
        elif char in ")]}>":
            if depth == 0:
                return None
            depth -= 1
        elif depth == 0 and char in ";,=":
            return None
        if char not in " \t\r\n":
            last = char
        index += 1
    return None


def ts_skip_angle(text: str, start: int) -> int | None:
    depth = 0
    index = start
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = ts_skip_quoted(text, index)
            continue
        if char in "{[(":
            index = ts_skip_balanced(text, index)
            continue
        if text.startswith("=>", index):
            index += 2
            continue
        if char == "<":
            depth += 1
        elif char == ">":
            depth -= 1
            if depth == 0:
                return index + 1
        elif char in ";)}]":
            return None
        index += 1
    return None


def ts_literal(value: str) -> str | None:
    value = re.sub(r"\s+as\s+const\s*$", "", value.strip())
    if len(value) >= 2 and value[0] in "'\"" and value[-1] == value[0] and ts_skip_quoted(value, 0) == len(value):
        return value[1:-1]
    if len(value) >= 2 and value[0] == "`" and value[-1] == "`" and "${" not in value:
        return value[1:-1]
    return None


def ts_string_parts(expression: str) -> list[tuple[str, str]] | None:
    expression = expression.strip()
    while expression.startswith("(") and ts_skip_balanced(expression, 0) == len(expression):
        expression = expression[1:-1].strip()
    if not expression:
        return None
    literal = ts_literal(expression)
    if literal is not None:
        return [("lit", literal)]
    if expression.startswith("`") and ts_skip_template(expression, 0) == len(expression):
        parts: list[tuple[str, str]] = []
        buffer: list[str] = []
        index = 1
        end = len(expression) - 1
        while index < end:
            char = expression[index]
            if char == "\\" and index + 1 < end:
                buffer.append(expression[index + 1])
                index += 2
                continue
            if expression.startswith("${", index):
                close = ts_skip_balanced(expression, index + 1)
                parts = merge_parts(parts, [("lit", "".join(buffer))])
                buffer = []
                parts.append(("expr", expression[index + 2:close - 1].strip()))
                index = close
                continue
            buffer.append(char)
            index += 1
        return merge_parts(parts, [("lit", "".join(buffer))])
    pieces = ts_split_top_level(expression, "+")
    if len(pieces) > 1:
        parts = []
        for piece in pieces:
            parts = merge_parts(parts, ts_string_parts(piece) or [("expr", piece.strip())])
        return parts
    return [("expr", expression)]


def ts_object_method(text: str) -> tuple[str, str] | None:
    text = text.strip()
    if not (text.startswith("{") and text.endswith("}")):
        return None
    result = ("default", "")
    for entry in ts_split_top_level(text[1:-1]):
        entry = entry.strip()
        if entry.startswith("..."):
            result = ("spread", entry[3:].strip())
            continue
        match = re.match(r"""(?:method|["']method["'])\s*(?::\s*(.+))?$""", entry, re.S)
        if match:
            value = (match.group(1) or "method").strip()
            literal = ts_literal(value)
            result = ("literal", literal.upper()) if literal is not None else ("identifier", value)
    return result


# --------------------------------------------------------------------------- typescript structure


@dataclass
class TsFunction:
    name: str | None
    params: list[str | None]
    body_start: int
    body_end: int


@dataclass
class TsCall:
    callee: str
    start: int
    generic: str | None
    args: list[str]


@dataclass
class TsConst:
    name: str
    start: int
    text: str
    scope: TsFunction | None


@dataclass
class Wrapper:
    kind: str
    position: int
    method: tuple
    base: str | None


def ts_params(text: str) -> list[str | None]:
    params: list[str | None] = []
    for raw in ts_split_top_level(text):
        item = PARAM_PREFIX_RE.sub("", raw.strip()).removeprefix("...")
        match = IDENT_RE.match(item)
        params.append(match.group(0) if match else None)
    return params


def ts_name_before(text: str, paren: int) -> tuple[str | None, int]:
    index = paren - 1
    while index >= 0 and text[index] in " \t\r\n":
        index -= 1
    if index >= 0 and text[index] == ">":
        depth = 0
        while index >= 0:
            if text[index] == ">":
                depth += 1
            elif text[index] == "<":
                depth -= 1
                if depth == 0:
                    index -= 1
                    break
            index -= 1
        while index >= 0 and text[index] in " \t\r\n":
            index -= 1
    end = index + 1
    while index >= 0 and (text[index].isalnum() or text[index] in "_$"):
        index -= 1
    return (text[index + 1:end] or None), index


def ts_arrow_name(code: str, position: int) -> str | None:
    match = ARROW_NAME_RE.search(code, max(0, position - 160), position)
    return match.group(1) if match else None


def ts_functions(code: str) -> list[TsFunction]:
    functions: list[TsFunction] = []
    for paren in ts_code_positions(code, "("):
        close = ts_skip_balanced(code, paren)
        cursor = skip_space(code, close)
        if cursor < len(code) and code[cursor] == ":":
            typed = ts_skip_type(code, cursor + 1)
            if typed is None:
                continue
            cursor = skip_space(code, typed)
        params = ts_params(code[paren + 1:close - 1])
        if code.startswith("=>", cursor):
            body = skip_space(code, cursor + 2)
            end = ts_skip_balanced(code, body) if body < len(code) and code[body] == "{" else ts_expression_end(code, body)
            functions.append(TsFunction(ts_arrow_name(code, paren), params, body, end))
        elif cursor < len(code) and code[cursor] == "{":
            name, before = ts_name_before(code, paren)
            if name is None or (name in TS_CONTROL):
                continue
            prior = before
            while prior >= 0 and code[prior] in " \t\r\n":
                prior -= 1
            if prior >= 0 and code[prior] == ".":
                continue
            functions.append(TsFunction(None if name == "function" else name, params, cursor, ts_skip_balanced(code, cursor)))
    for match in SINGLE_ARROW_RE.finditer(code):
        if match.group(1) in TS_TYPE_WORDS:
            continue
        body = skip_space(code, match.end())
        end = ts_skip_balanced(code, body) if body < len(code) and code[body] == "{" else ts_expression_end(code, body)
        functions.append(TsFunction(ts_arrow_name(code, match.start()), [match.group(1)], body, end))
    return functions


def ts_enclosing(functions: list[TsFunction], index: int) -> list[TsFunction]:
    chain = [function for function in functions if function.body_start <= index < function.body_end]
    return sorted(chain, key=lambda function: function.body_end - function.body_start)


def ts_calls(code: str, names: set[str]) -> list[TsCall]:
    if not names:
        return []
    alternation = "|".join(re.escape(name) for name in sorted(names, key=len, reverse=True))
    pattern = re.compile(rf"(?<![\w$.])(?:this\s*\.\s*)?({alternation})(?![\w$])")
    calls: list[TsCall] = []
    for match in pattern.finditer(code):
        prefix = code[max(0, match.start() - 12):match.start()]
        if re.search(r"\bfunction\s*$", prefix):
            continue
        cursor = skip_space(code, match.end())
        generic = None
        if cursor < len(code) and code[cursor] == "<":
            closing = ts_skip_angle(code, cursor)
            if closing is None:
                continue
            generic = " ".join(code[cursor + 1:closing - 1].split())
            cursor = skip_space(code, closing)
        if cursor >= len(code) or code[cursor] != "(":
            continue
        close = ts_skip_balanced(code, cursor)
        after = skip_space(code, close)
        if after < len(code) and code[after] == "{":
            continue
        if after < len(code) and code[after] == ":":
            typed = ts_skip_type(code, after + 1)
            if typed is not None and code[typed] == "{":
                continue
        args = [argument.strip() for argument in ts_split_top_level(code[cursor + 1:close - 1])]
        calls.append(TsCall(match.group(1), match.start(), generic, args))
    return calls


def ts_method_through(spec: tuple, args: list[str], params: list[str | None]) -> tuple:
    kind = spec[0]
    if kind in ("fixed", "unknown"):
        return spec
    position = spec[1]
    argument = args[position].strip() if position < len(args) else ""
    if kind == "param":
        literal = ts_literal(argument)
        if literal:
            return ("fixed", literal.upper())
        if argument and argument in params:
            return ("param", params.index(argument))
        return ("unknown",)
    if not argument:
        return ("fixed", "GET")
    if argument in params:
        return ("init", params.index(argument))
    described = ts_object_method(argument)
    if described is None:
        return ("unknown",)
    described_kind, value = described
    if described_kind == "default":
        return ("fixed", "GET")
    if described_kind == "literal":
        return ("fixed", value)
    if value in params:
        return ("param" if described_kind == "identifier" else "init", params.index(value))
    return ("unknown",)


@dataclass
class TsProject:
    props: dict[str, set[str]]
    functions: dict[str, set[str]]
    consts: dict[str, set[str]]


def ts_project(files: list[tuple[str, str]]) -> TsProject:
    props: dict[str, set[str]] = {}
    functions: dict[str, set[str]] = {}
    consts: dict[str, set[str]] = {}
    for _, text in files:
        if "process.env" not in text:
            continue
        code = ts_strip_comments(text)
        for match in PROP_RE.finditer(code):
            names = ts_env_names(code[match.end():ts_expression_end(code, match.end())])
            if names:
                props.setdefault(match.group(1), set()).update(names)
        for match in OBJECT_PROP_RE.finditer(code):
            names = ts_env_names(match.group(2))
            if names:
                props.setdefault(match.group(1), set()).update(names)
        for match in CONST_RE.finditer(code):
            names = ts_env_names(code[match.end():ts_expression_end(code, match.end())])
            if names:
                consts.setdefault(match.group(1), set()).update(names)
        for function in ts_functions(code):
            if function.name and function.body_end - function.body_start < 1500:
                names = ts_env_names(code[function.body_start:function.body_end])
                if names:
                    functions.setdefault(function.name, set()).update(names)
    return TsProject(props, functions, consts)


class TsFile:
    def __init__(self, relative: str, text: str, project: TsProject) -> None:
        self.relative = relative
        self.code = ts_strip_comments(text)
        self.lines = LineIndex(self.code)
        self.project = project
        self.functions = ts_functions(self.code)
        self.consts: dict[str, list[TsConst]] = {}
        for match in CONST_RE.finditer(self.code):
            end = ts_expression_end(self.code, match.end())
            chain = ts_enclosing(self.functions, match.start())
            self.consts.setdefault(match.group(1), []).append(
                TsConst(match.group(1), match.start(), self.code[match.end():end].strip(), chain[0] if chain else None)
            )

    def const_at(self, name: str, index: int) -> TsConst | None:
        best = None
        for definition in self.consts.get(name, []):
            if definition.start >= index:
                continue
            scope = definition.scope
            if scope is None or scope.body_start <= index < scope.body_end:
                if best is None or definition.start > best.start:
                    best = definition
        return best

    def base_envs(self, expression: str, index: int, depth: int = 0) -> set[str]:
        """Environment variables behind a base expression; empty when it carries a path (template)."""
        expression = ts_unwrap(expression)
        names = ts_env_names(expression)
        if names or depth > 4:
            return names
        match = re.fullmatch(rf"((?:this\s*\.\s*)?{IDENT}(?:\s*\??\.\s*{IDENT})*)\s*(\(.*\))?", expression, re.S)
        if not match:
            return set()
        chain = [piece for piece in re.split(r"\s*\??\.\s*", match.group(1)) if piece]
        last = chain[-1]
        if match.group(2) is not None:
            local = {
                name
                for function in self.functions
                if function.name == last
                for name in ts_env_names(self.code[function.body_start:function.body_end])
            }
            if local or last in self.project.functions:
                return local or set(self.project.functions[last])
        elif len(chain) == 1:
            definition = self.const_at(last, index)
            if definition:
                return self.single_expression_envs(definition.text, definition.start, depth)
            return set(self.project.consts.get(last, set()))
        elif last in self.project.props:
            return set(self.project.props[last])
        returned = self.member_return(expression)
        if returned:
            return self.single_expression_envs(returned[0], returned[1], depth)
        return set()

    def single_expression_envs(self, text: str, index: int, depth: int) -> set[str]:
        if len(ts_ternary_branches(text)) != 1:
            return set()
        parts = ts_string_parts(ts_unwrap(text))
        if parts and len(parts) == 1 and parts[0][0] == "expr":
            return self.base_envs(parts[0][1], index, depth + 1)
        return set()

    def member_return(self, expression: str) -> tuple[str, int] | None:
        """Value returned by a parameterless getter/method referenced as `this.name` or `name()`."""
        match = re.fullmatch(rf"(?:this\s*\.\s*)?({IDENT})(?:\s*\(\s*\))?", expression.strip())
        if not match:
            return None
        for function in self.functions:
            if function.name != match.group(1) or any(function.params):
                continue
            if function.body_start < len(self.code) and self.code[function.body_start] == "{":
                returned = re.compile(r"\breturn\s+").search(self.code, function.body_start, function.body_end)
                if not returned:
                    continue
                start = returned.end()
            else:
                start = function.body_start
            return self.code[start:ts_expression_end(self.code, start)].strip(), start
        return None

    def expand_argument(self, argument: str, index: int) -> list[tuple[str, str]]:
        """String parts of an argument, following one local const without branches."""
        argument = ts_unwrap(argument)
        parts = ts_string_parts(argument) or []
        if len(parts) == 1 and parts[0][0] == "expr" and re.fullmatch(IDENT, parts[0][1]):
            definition = self.const_at(parts[0][1], index)
            if definition and len(ts_ternary_branches(definition.text)) == 1:
                return ts_string_parts(ts_unwrap(definition.text)) or parts
        return parts

    def instances(self, name: str, index: int) -> list[tuple[str, int]] | None:
        for function in ts_enclosing(self.functions, index):
            if name not in function.params:
                continue
            if not function.name:
                return []
            position = function.params.index(name)
            found = []
            for call in ts_calls(self.code, {function.name}):
                if function.body_start <= call.start < function.body_end:
                    continue
                if position < len(call.args):
                    found.append((call.args[position], call.start))
            return found
        return None

    def candidates(self, expression: str, index: int, depth: int = 0) -> list[tuple[list[tuple[str, str]] | None, str | None]]:
        if depth > 4:
            return [(None, "expression resolution too deep")]
        parts = ts_string_parts(ts_unwrap(expression))
        if not parts:
            return [(None, f"unsupported expression `{short(expression)}`")]
        kind, head = parts[0]
        if kind != "expr":
            return [(parts, None)]
        head = ts_unwrap(head)
        parts = [("expr", head)] + parts[1:]
        if self.base_envs(head, index):
            return [(parts, None)]
        expansions = self.expand_head(head, index)
        if expansions is None:
            return [(parts, None)]
        results = []
        for source, source_index, reason in expansions:
            if source is None:
                results.append((None, reason))
                continue
            for sub, sub_reason in self.candidates(source, source_index, depth + 1):
                results.append((merge_parts(sub, parts[1:]) if sub else None, sub_reason))
        return results

    def expand_head(self, head: str, index: int) -> list[tuple[str | None, int, str | None]] | None:
        if re.fullmatch(IDENT, head):
            definition = self.const_at(head, index)
            if definition:
                return [(branch, definition.start, None) for branch in ts_ternary_branches(definition.text)]
            found = self.instances(head, index)
            if found is None:
                return None
            if not found:
                return [(None, 0, f"`{head}` is a parameter without literal call sites")]
            return [(argument, call_index, None) for argument, call_index in found]
        returned = self.member_return(head)
        return [(returned[0], returned[1], None)] if returned else None

    def wrappers(self) -> dict[str, Wrapper]:
        wrappers = {"fetch": Wrapper("transport", 0, ("init", 1), None)}
        for _ in range(8):
            added = False
            for call in ts_calls(self.code, set(wrappers)):
                chain = ts_enclosing(self.functions, call.start)
                if not chain:
                    continue
                function = chain[0]
                if not function.name or function.name in wrappers:
                    continue
                target = wrappers[call.callee]
                if target.position >= len(call.args):
                    continue
                parts = self.expand_argument(call.args[target.position], call.start)
                method = ts_method_through(target.method, call.args, function.params)
                if len(parts) == 1 and parts[0][0] == "expr" and parts[0][1] in function.params:
                    wrappers[function.name] = Wrapper(target.kind, function.params.index(parts[0][1]), method, target.base)
                    added = True
                    continue
                if target.kind == "transport":
                    if len(parts) == 2 and parts[0][0] == "expr" and parts[1][0] == "expr" and parts[1][1] in function.params:
                        wrappers[function.name] = Wrapper("path", function.params.index(parts[1][1]), method, parts[0][1])
                        added = True
            if not added:
                break
        return wrappers


def ts_extract_calls(
    consumer: str, relative: str, text: str, project: TsProject, bindings: "Bindings", same_origin_service: str | None = None,
) -> list[Call]:
    source = TsFile(relative, text, project)
    wrappers = source.wrappers()
    calls: list[Call] = []
    for call in ts_calls(source.code, set(wrappers)):
        target = wrappers[call.callee]
        if target.position >= len(call.args):
            continue
        argument = call.args[target.position]
        chain = ts_enclosing(source.functions, call.start)
        inner = chain[0] if chain else None
        if inner and inner.name in wrappers:
            parts = source.expand_argument(argument, call.start)
            if any(kind == "expr" and value in inner.params for kind, value in parts):
                continue
        spec = ts_method_through(target.method, call.args, [])
        method = spec[1] if spec[0] == "fixed" else None
        line = source.lines.line(call.start)
        for parts, reason in source.candidates(argument, call.start):
            record = Call(consumer, relative, line, call.callee, method, "unresolved", response_type=call.generic)
            if parts is None:
                record.reason = reason
                calls.append(record)
                continue
            if target.kind == "path":
                envs = source.base_envs(target.base or "", call.start)
                relative_parts = parts
                base_text = target.base or ""
            elif parts[0][0] == "lit":
                literal = parts[0][1]
                if re.match(r"(?i)https?://", literal):
                    record.status = "external"
                    record.reason = f"literal URL `{short(literal)}`"
                elif literal.startswith("/") and same_origin_service:
                    bindings.classify_same_origin(record, parts, same_origin_service)
                elif literal.startswith("/"):
                    record.status = "same_origin"
                    record.reason = "relative URL served by the consumer origin; no provider modeled for it"
                else:
                    record.reason = f"unsupported URL literal `{short(literal)}`"
                calls.append(record)
                continue
            else:
                base_text = parts[0][1]
                envs = source.base_envs(base_text, call.start)
                relative_parts = parts[1:]
            bindings.classify(record, envs, base_text, relative_parts)
            calls.append(record)
    return calls


# --------------------------------------------------------------------------- python


PY_ENV_RE = re.compile(r"""(?:os\.getenv|os\.environ\.get|environ\.get|getenv)\(\s*['"]([A-Z][A-Z0-9_]*)['"]|os\.environ\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]""")
PY_CALL_RE = re.compile(r"(?<![\w.])((?:[A-Za-z_]\w*\.)*[A-Za-z_]\w*)\.(get|post|put|patch|delete|head|options|request|stream)\s*\(")
PY_HTTP_RECEIVER_RE = re.compile(r"(?i)(client|session|http|requests|httpx)$")
PY_STRING_RE = re.compile(r"""(?is)([rbuf]{0,2})('''|\"\"\"|'|\")(.*)\2""")


def py_env_names(text: str) -> set[str]:
    return {left or right for left, right in PY_ENV_RE.findall(text)}


def py_skip_string(text: str, start: int) -> int:
    quote = text[start:start + 3] if text.startswith(("'''", '"""'), start) else text[start]
    index = start + len(quote)
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text.startswith(quote, index):
            return index + len(quote)
        if len(quote) == 1 and text[index] == "\n":
            return index
        index += 1
    return len(text)


def py_strip_comments(text: str) -> str:
    chars = list(text)
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = py_skip_string(text, index)
        elif char == "#":
            end = text.find("\n", index)
            end = len(text) if end == -1 else end
            blank(chars, index, end)
            index = end
        else:
            index += 1
    return "".join(chars)


def py_skip_balanced(text: str, start: int) -> int:
    expected = [OPENERS[text[start]]]
    index = start + 1
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = py_skip_string(text, index)
            continue
        if char in OPENERS:
            expected.append(OPENERS[char])
        elif char in CLOSERS and char == expected[-1]:
            expected.pop()
            if not expected:
                return index + 1
        index += 1
    return len(text)


def py_split_args(text: str) -> list[str]:
    parts = []
    depth = 0
    start = 0
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = py_skip_string(text, index)
            continue
        if char in OPENERS:
            depth += 1
        elif char in CLOSERS:
            depth -= 1
        elif char == "," and depth == 0:
            parts.append(text[start:index].strip())
            start = index + 1
        index += 1
    if text[start:].strip():
        parts.append(text[start:].strip())
    return parts


def py_string_parts(expression: str) -> list[tuple[str, str]] | None:
    expression = expression.strip()
    if not expression:
        return None
    match = PY_STRING_RE.fullmatch(expression)
    if not match:
        return [("expr", expression)]
    prefix, body = match.group(1).lower(), match.group(3)
    if "f" not in prefix:
        return [("lit", body)]
    parts: list[tuple[str, str]] = []
    buffer: list[str] = []
    index = 0
    while index < len(body):
        char = body[index]
        if body.startswith("{{", index) or body.startswith("}}", index):
            buffer.append(char)
            index += 2
            continue
        if char == "{":
            end = py_skip_balanced(body, index)
            inner = body[index + 1:end - 1]
            depth = 0
            for position, inner_char in enumerate(inner):
                if inner_char in "([{":
                    depth += 1
                elif inner_char in ")]}":
                    depth -= 1
                elif depth == 0 and inner_char in "!:" and not inner.startswith("!=", position):
                    inner = inner[:position]
                    break
            parts = merge_parts(parts, [("lit", "".join(buffer))])
            buffer = []
            parts.append(("expr", inner.strip()))
            index = end
            continue
        buffer.append(char)
        index += 1
    return merge_parts(parts, [("lit", "".join(buffer))])


def py_settings_envs(files: list[tuple[str, str]]) -> dict[str, str]:
    """Map pydantic-settings field names to the environment variable that feeds them."""
    mapping: dict[str, str] = {}
    for _, text in files:
        if "BaseSettings" not in text:
            continue
        code = py_strip_comments(text)
        for declaration in re.finditer(r"(?m)^class\s+\w+\s*\([^)]*BaseSettings[^)]*\)\s*:[ \t]*$", code):
            body_lines = []
            for line in code[declaration.end():].split("\n")[1:]:
                if line.strip() and not line.startswith((" ", "\t")):
                    break
                body_lines.append(line)
            body = "\n".join(body_lines)
            prefix_match = re.search(r"""env_prefix\s*=\s*['"]([^'"]*)['"]""", body)
            prefix = prefix_match.group(1) if prefix_match else ""
            for field_match in re.finditer(r"(?m)^[ \t]+([a-z_]\w*)\s*:[^\n]*", body):
                alias = re.search(r"""(?:validation_)?alias\s*=\s*['"]([A-Za-z0-9_]+)['"]""", field_match.group(0))
                mapping[field_match.group(1)] = (alias.group(1) if alias else prefix + field_match.group(1)).upper()
    return mapping


class PyFile:
    def __init__(self, relative: str, text: str, settings: dict[str, str] | None = None) -> None:
        self.relative = relative
        self.code = py_strip_comments(text)
        self.lines = LineIndex(self.code)
        self.settings = settings or {}

    def assignment(self, name: str, index: int) -> str | None:
        best = None
        for match in re.finditer(rf"(?m)^[ \t]*{re.escape(name)}\s*(?::[^=\n]+)?=(?!=)\s*", self.code):
            if match.start() >= index:
                break
            end = match.end()
            while end < len(self.code) and self.code[end] != "\n":
                if self.code[end] in OPENERS:
                    end = py_skip_balanced(self.code, end)
                    continue
                if self.code[end] in "'\"":
                    end = py_skip_string(self.code, end)
                    continue
                end += 1
            best = self.code[match.end():end].strip()
        return best

    def base_envs(self, expression: str, index: int, depth: int = 0) -> set[str]:
        names = py_env_names(expression) | {
            self.settings[attribute]
            for attribute in re.findall(r"settings\s*\.\s*([a-z_]\w*)", expression)
            if attribute in self.settings
        }
        if names or depth > 4:
            return names
        if re.fullmatch(r"[A-Za-z_]\w*", expression.strip()):
            value = self.assignment(expression.strip(), index)
            if value is not None:
                return self.base_envs(value, index, depth + 1)
        return set()

    def candidates(self, expression: str, index: int) -> list[tuple[str, str]] | None:
        parts = py_string_parts(expression)
        if parts and len(parts) == 1 and parts[0][0] == "expr" and re.fullmatch(r"[A-Za-z_]\w*", parts[0][1]):
            value = self.assignment(parts[0][1], index)
            if value is not None and not py_env_names(value):
                return py_string_parts(value)
        return parts


def py_extract_calls(consumer: str, relative: str, text: str, bindings: "Bindings", settings: dict[str, str] | None = None) -> list[Call]:
    source = PyFile(relative, text, settings)
    calls: list[Call] = []
    for match in PY_CALL_RE.finditer(source.code):
        receiver = match.group(1).split(".")[-1]
        if not PY_HTTP_RECEIVER_RE.search(receiver):
            continue
        opening = match.end() - 1
        args = [
            argument
            for argument in py_split_args(source.code[opening + 1:py_skip_balanced(source.code, opening) - 1])
            if not re.match(r"\w+\s*=(?!=)", argument)
        ]
        verb = match.group(2)
        if verb in ("request", "stream"):
            if len(args) < 2:
                continue
            literal = py_string_parts(args[0]) or []
            method = literal[0][1].upper() if len(literal) == 1 and literal[0][0] == "lit" else None
            url = args[1]
        else:
            if not args:
                continue
            method = verb.upper()
            url = args[0]
        record = Call(consumer, relative, source.lines.line(match.start()), f"{match.group(1)}.{verb}", method, "unresolved")
        parts = source.candidates(url, match.start())
        if not parts:
            record.reason = f"unsupported expression `{short(url)}`"
        elif parts[0][0] == "lit":
            if re.match(r"(?i)https?://", parts[0][1]):
                record.status = "external"
                record.reason = f"literal URL `{short(parts[0][1])}`"
            else:
                record.reason = "relative URL depends on client base_url"
        else:
            base_text = parts[0][1]
            bindings.classify(record, source.base_envs(base_text, match.start()), base_text, parts[1:])
        calls.append(record)
    return calls


# --------------------------------------------------------------------------- php


PHP_ENV_RE = re.compile(r"""env\(\s*['"]([A-Z][A-Z0-9_]*)['"]""")


def php_skip_string(text: str, start: int) -> int:
    quote = text[start]
    index = start + 1
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text[index] == quote:
            return index + 1
        index += 1
    return len(text)


def php_strip_comments(text: str) -> str:
    chars = list(text)
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = php_skip_string(text, index)
        elif text.startswith("//", index) or (char == "#" and not text.startswith("#[", index)):
            end = text.find("\n", index)
            end = len(text) if end == -1 else end
            blank(chars, index, end)
            index = end
        elif text.startswith("/*", index):
            end = text.find("*/", index + 2)
            end = len(text) if end == -1 else end + 2
            blank(chars, index, end)
            index = end
        else:
            index += 1
    return "".join(chars)


def php_skip_balanced(text: str, start: int) -> int:
    expected = [OPENERS[text[start]]]
    index = start + 1
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = php_skip_string(text, index)
            continue
        if char in OPENERS:
            expected.append(OPENERS[char])
        elif char in CLOSERS and char == expected[-1]:
            expected.pop()
            if not expected:
                return index + 1
        index += 1
    return len(text)


def php_split(text: str, separator: str) -> list[str]:
    parts = []
    depth = 0
    start = 0
    index = 0
    while index < len(text):
        char = text[index]
        if char in "'\"":
            index = php_skip_string(text, index)
            continue
        if char in OPENERS:
            depth += 1
        elif char in CLOSERS:
            depth -= 1
        elif depth == 0 and text.startswith(separator, index):
            parts.append(text[start:index].strip())
            index += len(separator)
            start = index
            continue
        index += 1
    if text[start:].strip():
        parts.append(text[start:].strip())
    return parts


def php_literal(value: str) -> str | None:
    value = value.strip()
    if len(value) >= 2 and value[0] in "'\"" and value[-1] == value[0] and php_skip_string(value, 0) == len(value):
        return value[1:-1]
    return None


PHP_LINK_RE = re.compile(r"\s*(?:::|->)?\s*([A-Za-z_]\w*)\s*\(")
PHP_ARROW_RE = re.compile(r"\s*->")


def php_chain(code: str, start: int) -> list[tuple[str, str, int]]:
    """Parse `Name::link(args)->link(args)...` starting right after `Name`."""
    links = []
    cursor = start
    while True:
        match = PHP_LINK_RE.match(code, cursor)
        if not match:
            break
        opening = match.end() - 1
        closing = php_skip_balanced(code, opening)
        links.append((match.group(1), code[opening + 1:closing - 1], match.start(1)))
        cursor = closing
        if not PHP_ARROW_RE.match(code, cursor):
            break
    return links


class PhpConsumerFile:
    def __init__(self, root: Path, relative: str, text: str) -> None:
        self.root = root
        self.relative = relative
        self.code = php_strip_comments(text)
        self.lines = LineIndex(self.code)

    def assignment(self, variable: str, index: int) -> str | None:
        best = None
        for match in re.finditer(rf"{re.escape(variable)}\s*=(?![=>])\s*", self.code):
            if match.start() >= index:
                break
            end = match.end()
            while end < len(self.code) and self.code[end] != ";":
                if self.code[end] in OPENERS:
                    end = php_skip_balanced(self.code, end)
                    continue
                if self.code[end] in "'\"":
                    end = php_skip_string(self.code, end)
                    continue
                end += 1
            best = self.code[match.end():end]
        return best

    def config_envs(self, key: str) -> set[str]:
        pieces = key.split(".")
        path = self.root / "config" / f"{pieces[0]}.php"
        if len(pieces) < 2 or not path.exists():
            return set()
        text = php_strip_comments(path.read_text(encoding="utf-8", errors="replace"))
        match = re.search(rf"""['"]{re.escape(pieces[-1])}['"]\s*=>\s*([^\n]+)""", text)
        return set(PHP_ENV_RE.findall(match.group(1))) if match else set()

    def parts(self, expression: str, index: int, depth: int = 0) -> tuple[list[tuple[str, str]], set[str]]:
        parts: list[tuple[str, str]] = []
        envs: set[str] = set()
        for piece in php_split(expression.strip(), "."):
            piece = re.sub(r"^\(\s*string\s*\)\s*", "", piece)
            literal = php_literal(piece)
            if literal is not None:
                parts = merge_parts(parts, [("lit", literal)])
                continue
            wrapped = re.fullmatch(r"(?:rtrim|trim|ltrim|strval)\((.*)\)", piece, re.S)
            if wrapped:
                piece = php_split(wrapped.group(1), ",")[0]
            config = re.fullmatch(r"""config\(\s*['"]([\w.]+)['"].*\)""", piece, re.S)
            found = set(PHP_ENV_RE.findall(piece)) or (self.config_envs(config.group(1)) if config else set())
            variable = re.fullmatch(r"\$[A-Za-z_]\w*", piece)
            if not found and variable and depth < 4:
                value = self.assignment(piece, index)
                if value is not None:
                    sub_parts, sub_envs = self.parts(value, index, depth + 1)
                    parts = merge_parts(parts, sub_parts)
                    envs |= sub_envs
                    continue
            if found and not parts:
                envs |= found
            parts.append(("expr", piece))
        return parts, envs


def php_extract_calls(consumer: str, root: Path, relative: str, text: str, bindings: "Bindings") -> list[Call]:
    source = PhpConsumerFile(root, relative, text)
    calls: list[Call] = []
    for match in re.finditer(r"(?<![\w\\])Http::", source.code):
        links = php_chain(source.code, match.start() + len("Http"))
        for name, args, position in links:
            if name.upper() not in HTTP_METHODS:
                continue
            arguments = php_split(args, ",")
            if not arguments:
                continue
            record = Call(consumer, relative, source.lines.line(position), f"Http::{name}", name.upper(), "unresolved")
            parts, envs = source.parts(arguments[0], position)
            if parts and parts[0][0] == "lit":
                if re.match(r"(?i)https?://", parts[0][1]):
                    record.status = "external"
                    record.reason = f"literal URL `{short(parts[0][1])}`"
                else:
                    record.reason = f"unsupported URL literal `{short(parts[0][1])}`"
            elif parts:
                bindings.classify(record, envs, parts[0][1], parts[1:])
            else:
                record.reason = f"unsupported expression `{short(arguments[0])}`"
            calls.append(record)
    return calls


GO_HTTP_METHODS = {
    "MethodGet": "GET", "MethodPost": "POST", "MethodPut": "PUT",
    "MethodPatch": "PATCH", "MethodDelete": "DELETE", "MethodHead": "HEAD",
    "MethodOptions": "OPTIONS",
}


def go_literal(expression: str) -> str | None:
    expression = expression.strip()
    if len(expression) >= 2 and expression[0] == "`" and expression[-1] == "`":
        return expression[1:-1]
    if len(expression) >= 2 and expression[0] == '"' and expression[-1] == '"':
        try:
            value = json.loads(expression)
            return value if isinstance(value, str) else None
        except json.JSONDecodeError:
            return None
    return None


def go_method(expression: str) -> str | None:
    expression = expression.strip()
    constant = re.fullmatch(r"(?:http\.)?(Method\w+)", expression)
    if constant:
        return GO_HTTP_METHODS.get(constant.group(1))
    literal = go_literal(expression)
    return literal.upper() if literal and literal.upper() in HTTP_METHODS else None


def go_assignments(code: str) -> dict[str, str]:
    assignments: dict[str, str] = {}
    for match in re.finditer(r"(?m)^\s*(?:var\s+)?([A-Za-z_]\w*)\s*(?::=|=)\s*([^\n;]+)", code):
        assignments[match.group(1)] = match.group(2).strip()
    return assignments


def go_url_parts(
    expression: str,
    assignments: dict[str, str],
    depth: int = 0,
) -> tuple[list[tuple[str, str]], set[str]]:
    expression = expression.strip()
    if depth > 5:
        return [("expr", expression)], set()
    if re.fullmatch(r"[A-Za-z_]\w*", expression) and expression in assignments:
        return go_url_parts(assignments[expression], assignments, depth + 1)
    getenv = re.fullmatch(r"os\.(?:Getenv|LookupEnv)\(\s*[\"`]([A-Z][A-Z0-9_]*)[\"`]\s*\)", expression)
    if getenv:
        return [], {getenv.group(1)}
    wrapped = re.fullmatch(r"strings\.TrimRight\((.*),\s*[\"`]/[\"`]\s*\)", expression, re.S)
    if wrapped:
        return go_url_parts(wrapped.group(1), assignments, depth + 1)
    sprintf = re.fullmatch(r"fmt\.Sprintf\((.*)\)", expression, re.S)
    if sprintf:
        arguments = ts_split_top_level(sprintf.group(1))
        template = go_literal(arguments[0]) if arguments else None
        if template is None:
            return [("expr", expression)], set()
        chunks = template.split("%s")
        parts: list[tuple[str, str]] = []
        envs: set[str] = set()
        if chunks[0]:
            parts.append(("lit", chunks[0]))
        for index, chunk in enumerate(chunks[1:]):
            argument = arguments[index + 1] if index + 1 < len(arguments) else "%s"
            nested_parts, nested_envs = go_url_parts(argument, assignments, depth + 1)
            envs |= nested_envs
            if nested_parts:
                parts.extend(nested_parts)
            elif not nested_envs:
                parts.append(("expr", argument))
            if chunk:
                parts.append(("lit", chunk))
        return parts, envs
    pieces = ts_split_top_level(expression, "+")
    if len(pieces) > 1:
        parts: list[tuple[str, str]] = []
        envs: set[str] = set()
        for piece in pieces:
            nested_parts, nested_envs = go_url_parts(piece, assignments, depth + 1)
            parts.extend(nested_parts)
            envs |= nested_envs
        return parts, envs
    literal = go_literal(expression)
    if literal is not None:
        return [("lit", literal)], set()
    return [("expr", expression)], set()


def classify_go_call(
    record: Call,
    expression: str,
    assignments: dict[str, str],
    bindings: "Bindings",
) -> None:
    parts, envs = go_url_parts(expression, assignments)
    if parts and parts[0][0] == "lit" and re.match(r"(?i)^https?://", parts[0][1]):
        record.status = "external"
        record.reason = f"literal URL `{short(parts[0][1])}`"
        return
    if envs:
        bindings.classify(record, envs, expression, parts)
        return
    record.reason = f"URL `{short(expression)}` does not resolve to an environment variable"


def go_extract_calls(consumer: str, relative: str, text: str, bindings: "Bindings") -> list[Call]:
    code = ts_strip_comments(text)
    lines = LineIndex(code)
    assignments = go_assignments(code)
    calls: list[Call] = []
    constructors = re.compile(r"http\.(NewRequestWithContext|NewRequest)\s*\(")
    for match in constructors.finditer(code):
        opening = match.end() - 1
        closing = ts_skip_balanced(code, opening)
        arguments = ts_split_top_level(code[opening + 1:closing - 1])
        offset = 1 if match.group(1) == "NewRequestWithContext" else 0
        if len(arguments) <= offset + 1:
            continue
        method = go_method(arguments[offset])
        record = Call(
            consumer, relative, lines.line(match.start()), f"http.{match.group(1)}",
            method, "unresolved",
        )
        classify_go_call(record, arguments[offset + 1], assignments, bindings)
        calls.append(record)
    direct = re.compile(r"(?<![\w.])(?:http|[A-Za-z_]\w*)\.(Get|Post|PostForm|Head)\s*\(")
    for match in direct.finditer(code):
        opening = match.end() - 1
        closing = ts_skip_balanced(code, opening)
        arguments = ts_split_top_level(code[opening + 1:closing - 1])
        if not arguments:
            continue
        method = "POST" if match.group(1) in {"Post", "PostForm"} else match.group(1).upper()
        record = Call(
            consumer, relative, lines.line(match.start()), f"http.{match.group(1)}",
            method, "unresolved",
        )
        classify_go_call(record, arguments[0], assignments, bindings)
        calls.append(record)
    return calls


# --------------------------------------------------------------------------- providers

NEST_CONTROLLER_RE = re.compile(r"@Controller\s*\(")
NEST_METHOD_RE = re.compile(r"@(Get|Post|Put|Patch|Delete|All|Head|Options)\s*\(")


def nest_paths(argument: str) -> list[str] | None:
    argument = argument.strip()
    if not argument:
        return [""]
    literal = ts_literal(argument)
    if literal is not None:
        return [literal]
    if argument.startswith("["):
        values = [ts_literal(item) for item in ts_split_top_level(argument.strip()[1:-1])]
        return None if any(value is None for value in values) else [value for value in values if value is not None]
    if argument.startswith("{"):
        for entry in ts_split_top_level(argument[1:-1]):
            key, _, value = entry.partition(":")
            if key.strip() == "path":
                return nest_paths(value)
        return [""]
    return None


def nest_routes(service: str, relative: str, text: str, findings: list[Finding]) -> list[Route]:
    code = ts_strip_comments(text)
    lines = LineIndex(code)
    routes: list[Route] = []
    for controller in NEST_CONTROLLER_RE.finditer(code):
        opening = controller.end() - 1
        closing = ts_skip_balanced(code, opening)
        arguments = ts_split_top_level(code[opening + 1:closing - 1])
        prefixes = nest_paths(arguments[0] if arguments else "")
        if prefixes is None:
            findings.append(Finding("warning", "unsupported_route_declaration", f"non-literal @Controller path in {service}", relative, lines.line(controller.start())))
            continue
        declaration = re.compile(r"class\s+([A-Za-z_$][\w$]*)[^{]*\{").search(code, closing)
        if not declaration:
            continue
        body_start = declaration.end() - 1
        body_end = ts_skip_balanced(code, body_start)
        class_name = declaration.group(1)
        for decorator in NEST_METHOD_RE.finditer(code, body_start, body_end):
            method = decorator.group(1).upper()
            decorator_open = decorator.end() - 1
            decorator_close = ts_skip_balanced(code, decorator_open)
            decorator_args = ts_split_top_level(code[decorator_open + 1:decorator_close - 1])
            paths = nest_paths(decorator_args[0] if decorator_args else "")
            line = lines.line(decorator.start())
            if paths is None:
                findings.append(Finding("warning", "unsupported_route_declaration", f"non-literal @{decorator.group(1)} path in {class_name}", relative, line))
                continue
            cursor = decorator_close
            while True:
                cursor = skip_space(code, cursor)
                extra = re.compile(r"@[\w.]+").match(code, cursor)
                if not extra:
                    break
                cursor = skip_space(code, extra.end())
                if cursor < len(code) and code[cursor] == "(":
                    cursor = ts_skip_balanced(code, cursor)
            handler = re.compile(rf"(?:(?:public|private|protected|static|async|override)\s+)*({IDENT})\s*(?:<[^>]*>)?\s*\(").match(code, cursor)
            handler_name = request_type = response_type = None
            if handler:
                handler_name = handler.group(1)
                params_open = handler.end() - 1
                params_close = ts_skip_balanced(code, params_open)
                body = re.search(rf"@Body\s*\([^)]*\)\s*{IDENT}\s*\??\s*:\s*({IDENT}(?:\.{IDENT})*(?:\[\])?)", code[params_open:params_close])
                request_type = body.group(1) if body else None
                after = skip_space(code, params_close)
                if after < len(code) and code[after] == ":":
                    typed = ts_skip_type(code, after + 1)
                    if typed is not None:
                        annotation = " ".join(code[after + 1:typed].split())
                        wrapped = re.fullmatch(r"Promise<(.*)>", annotation)
                        response_type = wrapped.group(1) if wrapped else annotation
            for prefix in prefixes:
                for path in paths:
                    for segments in split_provider_path(prefix, path):
                        routes.append(Route(
                            service, method, render_path(segments), segments, relative, line,
                            f"{class_name}.{handler_name}" if handler_name else class_name,
                            module_of(relative), request_type, response_type,
                        ))
    return routes


def nest_prefix_findings(service: str, files: list[tuple[str, str]], findings: list[Finding]) -> str:
    prefix = ""
    for relative, text in files:
        code = ts_strip_comments(text)
        for match in re.finditer(r"\.setGlobalPrefix\s*\(\s*([^,)]+)", code):
            literal = ts_literal(match.group(1))
            if literal is None:
                findings.append(Finding("warning", "unsupported_route_declaration", f"non-literal global prefix in {service}", relative, LineIndex(code).line(match.start())))
            else:
                prefix = literal
        for pattern, label in ((r"\.enableVersioning\s*\(", "URI versioning"), (r"RouterModule\.register\s*\(", "RouterModule prefixes")):
            match = re.search(pattern, code)
            if match:
                findings.append(Finding("warning", "unsupported_route_declaration", f"{label} not modeled in {service}; routes may be missing a prefix", relative, LineIndex(code).line(match.start())))
    return prefix


LARAVEL_VERBS = {"get", "post", "put", "patch", "delete", "options", "any", "match", "apiresource", "resource"}


def laravel_routes(service: str, root: Path, relative: str, text: str, findings: list[Finding]) -> list[Route]:
    code = php_strip_comments(text)
    lines = LineIndex(code)
    base_prefix = ""
    if Path(relative).name == "api.php":
        base_prefix = "api"
        bootstrap = root / "bootstrap/app.php"
        if bootstrap.exists():
            match = re.search(r"""apiPrefix\s*:\s*['"]([^'"]*)['"]""", bootstrap.read_text(encoding="utf-8", errors="replace"))
            if match:
                base_prefix = match.group(1)
    routes: list[Route] = []
    groups: list[tuple[int, str]] = []
    for occurrence in re.finditer(r"(?<![\w\\])Route::", code):
        groups = [group for group in groups if group[0] > occurrence.start()]
        links = php_chain(code, occurrence.start() + len("Route"))
        names = [name.lower() for name, _, _ in links]
        prefix = ""
        for name, args, _ in links:
            if name.lower() == "prefix":
                prefix = php_literal(php_split(args, ",")[0]) or ""
            if name.lower() == "group":
                attributes = re.search(r"""['"]prefix['"]\s*=>\s*['"]([^'"]*)['"]""", php_split(args, ",")[0] if args else "")
                if attributes:
                    prefix = attributes.group(1)
        if "group" in names:
            group_position = links[names.index("group")][2]
            group_end = php_skip_balanced(code, code.index("(", group_position))
            groups.append((group_end, prefix))
            continue
        verbs = [link for link in links if link[0].lower() in LARAVEL_VERBS]
        if not verbs:
            continue
        name, args, position = verbs[-1]
        arguments = php_split(args, ",")
        line = lines.line(position)
        stacked = [base_prefix] + [group[1] for group in sorted(groups)] + [prefix]
        verb = name.lower()
        if verb in ("apiresource", "resource"):
            resource = php_literal(arguments[0]) if arguments else None
            if resource is None or "." in resource:
                findings.append(Finding("warning", "unsupported_route_declaration", f"resource route not modeled in {service}", relative, line))
                continue
            actions = {
                "index": ("GET", ""), "store": ("POST", ""), "show": ("GET", "{id}"),
                "update": ("PUT|PATCH", "{id}"), "destroy": ("DELETE", "{id}"),
            }
            if verb == "resource":
                actions.update({"create": ("GET", "create"), "edit": ("GET", "{id}/edit")})
            for link_name, link_args, _ in links:
                selected = re.findall(r"""['"](\w+)['"]""", link_args)
                if link_name.lower() == "only":
                    actions = {key: value for key, value in actions.items() if key in selected}
                elif link_name.lower() == "except":
                    actions = {key: value for key, value in actions.items() if key not in selected}
            for action, (methods, suffix) in actions.items():
                for method in methods.split("|"):
                    for segments in split_provider_path(*stacked, resource, suffix):
                        routes.append(Route(service, method, render_path(segments), segments, relative, line, f"{short(arguments[1]) if len(arguments) > 1 else resource}@{action}", None))
            continue
        if verb == "match":
            methods = [method.upper() for method in re.findall(r"""['"](\w+)['"]""", arguments[0])] if arguments else []
            uri_argument = arguments[1] if len(arguments) > 1 else None
            handler_argument = arguments[2] if len(arguments) > 2 else ""
        else:
            methods = ["ALL" if verb == "any" else verb.upper()]
            uri_argument = arguments[0] if arguments else None
            handler_argument = arguments[1] if len(arguments) > 1 else ""
        uri = php_literal(uri_argument) if uri_argument else None
        if uri is None:
            findings.append(Finding("warning", "unsupported_route_declaration", f"non-literal route URI in {service}", relative, line))
            continue
        handler_match = re.search(r"([A-Za-z_]\w*)::class(?:\s*,\s*['\"](\w+)['\"])?", handler_argument)
        handler = f"{handler_match.group(1)}@{handler_match.group(2) or '__invoke'}" if handler_match else "closure"
        for method in methods:
            for segments in split_provider_path(*stacked, uri):
                routes.append(Route(service, method, render_path(segments), segments, relative, line, handler, None))
    return routes


FASTAPI_ROUTER_RE = re.compile(r"(?m)^[ \t]*([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*(?:fastapi\.)?(APIRouter|FastAPI)\s*\(")
FASTAPI_DECORATOR_RE = re.compile(r"@([A-Za-z_]\w*)\.(get|post|put|patch|delete|options|head|api_route)\s*\(")


def fastapi_routes(service: str, files: list[tuple[str, str]], findings: list[Finding]) -> list[Route]:
    parsed = {relative: py_strip_comments(text) for relative, text in files}
    include_prefixes: dict[tuple[str, str], list[str]] = {}
    for relative, code in parsed.items():
        imports: dict[str, tuple[str, str]] = {}
        for match in re.finditer(r"(?m)^\s*from\s+([.\w]+)\s+import\s+\(?([^)\n]+)\)?", code):
            module = match.group(1).split(".")[-1]
            for item in match.group(2).split(","):
                original, _, alias = item.strip().partition(" as ")
                if original.strip():
                    imports[(alias or original).strip()] = (module, original.strip())
        for match in re.finditer(r"\.include_router\s*\(", code):
            opening = match.end() - 1
            arguments = py_split_args(code[opening + 1:py_skip_balanced(code, opening) - 1])
            if not arguments:
                continue
            target = imports.get(arguments[0], (Path(relative).stem, arguments[0]))
            prefix = ""
            for argument in arguments[1:]:
                keyword = re.fullmatch(r"""prefix\s*=\s*['"]([^'"]*)['"]""", argument)
                if keyword:
                    prefix = keyword.group(1)
            include_prefixes.setdefault(target, []).append(prefix)
    routes: list[Route] = []
    for relative, code in parsed.items():
        lines = LineIndex(code)
        routers: dict[str, tuple[str, str]] = {}
        for match in FASTAPI_ROUTER_RE.finditer(code):
            opening = match.end() - 1
            prefix = re.search(r"""prefix\s*=\s*['"]([^'"]*)['"]""", code[opening:py_skip_balanced(code, opening)])
            routers[match.group(1)] = (match.group(2), prefix.group(1) if prefix else "")
        for decorator in FASTAPI_DECORATOR_RE.finditer(code):
            owner, verb = decorator.group(1), decorator.group(2)
            opening = decorator.end() - 1
            arguments = py_split_args(code[opening + 1:py_skip_balanced(code, opening) - 1])
            line = lines.line(decorator.start())
            path = None
            methods = [verb.upper()]
            response_type = None
            for position, argument in enumerate(arguments):
                keyword = re.fullmatch(r"(\w+)\s*=\s*(.+)", argument, re.S)
                if keyword and keyword.group(1) == "path":
                    parts = py_string_parts(keyword.group(2))
                    path = parts[0][1] if parts and len(parts) == 1 and parts[0][0] == "lit" else None
                elif keyword and keyword.group(1) == "methods":
                    methods = [method.upper() for method in re.findall(r"""['"](\w+)['"]""", keyword.group(2))]
                elif keyword and keyword.group(1) == "response_model":
                    response_type = keyword.group(2).strip()
                elif position == 0 and not keyword:
                    parts = py_string_parts(argument)
                    path = parts[0][1] if parts and len(parts) == 1 and parts[0][0] == "lit" else None
            if path is None:
                findings.append(Finding("warning", "unsupported_route_declaration", f"non-literal FastAPI path in {service}", relative, line))
                continue
            handler = re.compile(r"\s*(?:@[^\n]*\n\s*)*(?:async\s+)?def\s+([A-Za-z_]\w*)").match(code, py_skip_balanced(code, opening))
            kind, router_prefix = routers.get(owner, ("APIRouter", ""))
            mounts = [""] if kind == "FastAPI" else include_prefixes.get((Path(relative).stem, owner), [""])
            for mount in mounts:
                for method in methods:
                    for segments in split_provider_path(mount, router_prefix, path):
                        routes.append(Route(service, method, render_path(segments), segments, relative, line, handler.group(1) if handler else None, None, None, response_type))
    return routes


GO_SERVE_MUX_ROUTE_RE = re.compile(
    r"\.Handle(?:Func)?\s*\(\s*(?P<quote>[\"`])(?P<pattern>[^\"`]+)(?P=quote)\s*,"
)


def go_routes(service: str, files: list[tuple[str, str]], findings: list[Finding]) -> list[Route]:
    """Extract Go 1.22 net/http ServeMux method patterns.

    The adapter deliberately accepts only literal patterns. Runtime-composed
    routes are reported instead of guessed because a guessed provider surface
    makes the consumer drift gate unsafe.
    """
    routes: list[Route] = []
    for relative, text in files:
        code = ts_strip_comments(text)
        lines = LineIndex(code)
        for match in GO_SERVE_MUX_ROUTE_RE.finditer(code):
            pattern = match.group("pattern").strip()
            method = "ALL"
            path = pattern
            pieces = pattern.split(None, 1)
            if len(pieces) == 2 and pieces[0].upper() in HTTP_METHODS:
                method, path = pieces[0].upper(), pieces[1]
            if not path.startswith("/"):
                findings.append(Finding(
                    "warning", "unsupported_route_declaration",
                    f"non-path Go ServeMux pattern `{pattern}` in {service}",
                    relative, lines.line(match.start()),
                ))
                continue
            statement_end = code.find("\n", match.end())
            if statement_end < 0:
                statement_end = len(code)
            handler_text = code[match.end():statement_end]
            handler_names = re.findall(rf"(?:{IDENT}\.)+{IDENT}", handler_text)
            handler = handler_names[-1] if handler_names else None
            for segments in split_provider_path(path):
                routes.append(Route(
                    service, method, render_path(segments), segments, relative,
                    lines.line(match.start()), handler, module_of(relative),
                ))
    return routes


def openapi_schema_name(schema: Any) -> str | None:
    if not isinstance(schema, dict):
        return None
    reference = schema.get("$ref")
    if isinstance(reference, str):
        return reference.rsplit("/", 1)[-1]
    if schema.get("type") == "array":
        item = openapi_schema_name(schema.get("items"))
        return f"{item}[]" if item else "array"
    schema_type = schema.get("type")
    return str(schema_type) if schema_type else None


def openapi_content_schema(container: Any) -> str | None:
    if not isinstance(container, dict):
        return None
    content = container.get("content")
    if not isinstance(content, dict):
        return None
    for media_type in ("application/json", "application/problem+json"):
        media = content.get(media_type)
        if isinstance(media, dict):
            return openapi_schema_name(media.get("schema"))
    return None


def openapi_routes(
    service: str,
    repo: Path,
    contract: str,
    findings: list[Finding],
) -> list[Route]:
    path = repo / contract
    if not path.is_file():
        findings.append(Finding(
            "error", "provider_contract_missing",
            f"OpenAPI contract {contract} for {service} does not exist", contract,
            service=service,
        ))
        return []
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        findings.append(Finding(
            "error", "provider_contract_invalid",
            f"cannot parse OpenAPI contract for {service}: {exc}", contract,
            service=service,
        ))
        return []
    paths = document.get("paths", {}) if isinstance(document, dict) else {}
    if not isinstance(paths, dict):
        findings.append(Finding(
            "error", "provider_contract_invalid",
            f"OpenAPI contract for {service} has no paths object", contract,
            service=service,
        ))
        return []
    routes: list[Route] = []
    for raw_path, path_item in paths.items():
        if not isinstance(raw_path, str) or not isinstance(path_item, dict):
            continue
        for method in HTTP_METHODS:
            operation = path_item.get(method.lower())
            if not isinstance(operation, dict):
                continue
            request_type = openapi_content_schema(operation.get("requestBody"))
            response_type = None
            responses = operation.get("responses", {})
            if isinstance(responses, dict):
                for status in sorted(responses, key=str):
                    if str(status).startswith("2"):
                        response_type = openapi_content_schema(responses[status])
                        if response_type:
                            break
            for segments in split_provider_path(raw_path):
                routes.append(Route(
                    service, method, render_path(segments), segments, contract, 1,
                    str(operation.get("operationId")) if operation.get("operationId") else None,
                    None, request_type, response_type,
                ))
    return routes


def reconcile_provider_contract(
    service: str,
    implementation: list[Route],
    contract: list[Route],
    findings: list[Finding],
) -> list[Route]:
    implementation_by_key = {(route.method, route.path): route for route in implementation}
    contract_by_key = {(route.method, route.path): route for route in contract}
    for key in sorted(implementation_by_key.keys() - contract_by_key.keys()):
        route = implementation_by_key[key]
        findings.append(Finding(
            "error", "provider_contract_drift",
            f"{service} implements {route.method} {route.path} but OpenAPI does not declare it",
            route.file, route.line, service, route.method, route.path,
        ))
    for key in sorted(contract_by_key.keys() - implementation_by_key.keys()):
        route = contract_by_key[key]
        findings.append(Finding(
            "error", "provider_contract_drift",
            f"OpenAPI declares {route.method} {route.path} but {service} does not implement it",
            route.file, route.line, service, route.method, route.path,
        ))
    for key in implementation_by_key.keys() & contract_by_key.keys():
        route = implementation_by_key[key]
        documented = contract_by_key[key]
        route.request_type = documented.request_type
        route.response_type = documented.response_type
    return implementation


NEXT_HANDLER_RE = re.compile(
    r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b"
    r"|export\s+(?:const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*="
)


def nextjs_routes(service: str, repo: Path, root: str, files: list[tuple[str, str]], findings: list[Finding]) -> list[Route]:
    """App Router `route.ts` handlers and Pages Router `pages/api` files served by the app origin."""
    for config_name in ("next.config.js", "next.config.mjs", "next.config.ts"):
        config_file = repo / root / config_name
        if config_file.exists():
            text = ts_strip_comments(config_file.read_text(encoding="utf-8", errors="replace"))
            for option in ("basePath", "rewrites"):
                if re.search(rf"\b{option}\s*[:(]", text):
                    findings.append(Finding("warning", "unsupported_route_declaration", f"Next.js {option} not modeled in {service}", f"{root}/{config_name}"))
    routes: list[Route] = []
    for relative, text in files:
        path = Path(relative)
        parts = path.parts
        if path.stem == "route" and "app" in parts:
            start = len(parts) - 1 - parts[::-1].index("app")
            raw_segments = list(parts[start + 1:-1])
            code = ts_strip_comments(text)
            methods = sorted({left or right for left, right in NEXT_HANDLER_RE.findall(code)})
            for exported in re.finditer(r"export\s*\{([^}]*)\}", code):
                methods = sorted(set(methods) | set(re.findall(r"\bas\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b", exported.group(1))))
            handler = "route"
        elif "pages" in parts and len(parts) > parts.index("pages") + 1 and parts[parts.index("pages") + 1] == "api":
            raw_segments = list(parts[parts.index("pages") + 1:-1]) + ([] if path.stem == "index" else [path.stem])
            methods = ["ALL"]
            handler = "default"
        else:
            continue
        segments = []
        for segment in raw_segments:
            if (segment.startswith("(") and segment.endswith(")")) or segment.startswith("@"):
                continue
            segments.append(PARAM if segment.startswith("[") and segment.endswith("]") else segment)
        for method in methods:
            routes.append(Route(service, method, render_path(tuple(segments)), tuple(segments), relative, 1, f"{path.name}:{method if handler == 'route' else handler}", None))
    return routes


# --------------------------------------------------------------------------- bindings and graph


class Bindings:
    def __init__(self, config: dict[str, Any]) -> None:
        self.env_to_service: dict[str, str] = {}
        self.full_url_env: dict[str, str] = {}
        for service_id, service in config["services"].items():
            for group, target in (("base_env", self.env_to_service), ("full_url_env", self.full_url_env)):
                for env in service.get(group, []) or []:
                    if env in self.env_to_service or env in self.full_url_env:
                        raise ValueError(f"environment variable {env} is bound to more than one service")
                    target[env] = service_id
        self.external = set(config.get("external_env", []) or [])
        self.observed: set[str] = set()

    def classify_same_origin(self, record: Call, parts: list[tuple[str, str]], service: str) -> None:
        segments, reason = relative_segments(parts)
        record.services = (service,)
        if segments is None:
            record.reason = reason
            return
        record.segments = segments
        record.path = render_path(segments)
        record.status = "resolved"

    def classify(self, record: Call, envs: set[str], base_text: str, relative_parts: list[tuple[str, str]]) -> None:
        self.observed |= envs
        if not envs:
            record.reason = f"base `{short(base_text)}` does not resolve to an environment variable"
            return
        if envs <= self.external:
            record.status = "external"
            record.reason = f"external base {', '.join(sorted(envs))}"
            return
        full = {self.full_url_env[env] for env in envs if env in self.full_url_env}
        services = {self.env_to_service[env] for env in envs if env in self.env_to_service}
        unbound = sorted(env for env in envs if env not in self.env_to_service and env not in self.full_url_env and env not in self.external)
        if full and not relative_parts:
            record.status = "path_in_environment"
            record.services = tuple(sorted(full))
            record.reason = f"full URL comes from {', '.join(sorted(env for env in envs if env in self.full_url_env))}"
            return
        if not services:
            record.reason = f"environment variable(s) {', '.join(unbound)} not bound in api-graph.yaml"
            return
        if len(services) > 1:
            record.reason = f"base binds to more than one service: {', '.join(sorted(services))}"
        segments, reason = relative_segments(relative_parts)
        record.services = tuple(sorted(services))
        if segments is None:
            record.reason = reason
            return
        record.segments = segments
        record.path = render_path(segments)
        record.status = "resolved"


def iter_files(root: Path, sources: list[str], extensions: set[str], excludes: list[str]) -> list[Path]:
    found: list[Path] = []
    for source in sources:
        base = root / source
        if base.is_file():
            found.append(base)
            continue
        if not base.is_dir():
            continue
        stack = [base]
        while stack:
            directory = stack.pop()
            for entry in sorted(directory.iterdir()):
                if entry.is_dir():
                    if entry.name not in SKIP_DIRS:
                        stack.append(entry)
                elif entry.suffix in extensions:
                    relative = entry.relative_to(root).as_posix()
                    if not any(fnmatch.fnmatch(relative, pattern) or fnmatch.fnmatch("/" + relative, pattern) for pattern in excludes):
                        found.append(entry)
    return sorted(found)


def read_files(repo: Path, paths: list[Path]) -> list[tuple[str, str]]:
    return [(path.relative_to(repo).as_posix(), path.read_text(encoding="utf-8", errors="replace")) for path in paths]


def link_calls(routes: list[Route], calls: list[Call], findings: list[Finding]) -> None:
    by_service: dict[str, list[Route]] = {}
    for route in routes:
        by_service.setdefault(route.service, []).append(route)
    for call in calls:
        if call.status != "resolved" or call.segments is None:
            continue
        compatible = lambda route: call.method is None or route.method in (call.method, "ALL")

        def best(candidates: list[Route]) -> Route | None:
            scored = [(path_score(call.segments, route.segments), route) for route in candidates]
            scored = [(score, route) for score, route in scored if score is not None]
            if not scored:
                return None
            return sorted(scored, key=lambda item: (-item[0], item[1].path, item[1].method, item[1].file, item[1].line))[0][1]

        own = [route for service in call.services for route in by_service.get(service, [])]
        match = best([route for route in own if compatible(route)])
        where = f"{call.method or '?'} {call.path}"
        if match:
            call.route = match
            match.consumers.append(f"{call.file}:{call.line}")
            if any(left == PARAM and right != PARAM for left, right in zip(call.segments, match.segments)):
                findings.append(Finding(
                    "info", "ambiguous_match",
                    f"{where} matched {match.path} only because a runtime segment was assumed to equal a literal",
                    call.file, call.line,
                ))
            continue
        path_only = best(own)
        if path_only:
            call.status = "method_mismatch"
            methods = sorted({route.method for route in own if path_score(call.segments, route.segments) is not None})
            call.reason = f"{', '.join(call.services)} exposes {', '.join(methods)} for this path"
            findings.append(Finding("error", "method_mismatch", f"{where} -> {call.reason}", call.file, call.line, method=call.method, path=call.path))
            continue
        elsewhere = best([route for route in routes if route.service not in call.services and compatible(route)])
        if elsewhere:
            call.status = "wrong_service"
            call.reason = f"route exists in {elsewhere.service} ({elsewhere.file}:{elsewhere.line}), not in {', '.join(call.services)}"
            findings.append(Finding("error", "wrong_service", f"{where} -> {call.reason}", call.file, call.line, method=call.method, path=call.path))
            continue
        call.status = "orphan"
        call.reason = f"no route in {', '.join(call.services)}"
        findings.append(Finding("error", "orphan_call", f"{where} -> {call.reason}", call.file, call.line, method=call.method, path=call.path))


def build_graph(repo: Path, config_path: Path) -> dict[str, Any]:
    config_file = config_path if config_path.is_absolute() else repo / config_path
    raw = config_file.read_bytes()
    config = yaml.safe_load(raw)
    excludes = list(config.get("exclude", []) or [])
    bindings = Bindings(config)
    findings: list[Finding] = []
    routes: list[Route] = []
    service_rows = []

    for service_id, service in sorted(config["services"].items()):
        root = repo / service["root"]
        framework = service["framework"]
        if not root.is_dir():
            findings.append(Finding("info" if service.get("optional") else "warning", "config_path_missing", f"service root {service['root']} not found", service["root"]))
            continue
        sources = service.get("sources", ["."])
        if framework == "nestjs":
            files = read_files(repo, iter_files(root, sources, {".ts"}, excludes))
            prefix = nest_prefix_findings(service_id, files, findings)
            service_routes = []
            for relative, text in files:
                if "@Controller" in text:
                    for route in nest_routes(service_id, relative, text, findings):
                        if prefix:
                            route.segments = split_provider_path(prefix, route.path)[0]
                            route.path = render_path(route.segments)
                        service_routes.append(route)
        elif framework == "laravel":
            files = read_files(repo, iter_files(root, sources, {".php"}, excludes))
            service_routes = [
                route
                for relative, text in files
                if Path(relative).name in ("api.php", "web.php")
                for route in laravel_routes(service_id, root, relative, text, findings)
            ]
        elif framework == "fastapi":
            files = read_files(repo, iter_files(root, sources, {".py"}, excludes))
            service_routes = fastapi_routes(service_id, files, findings)
        elif framework == "go-net-http":
            files = read_files(repo, iter_files(root, sources, {".go"}, excludes))
            service_routes = go_routes(service_id, files, findings)
            contract_path = service.get("openapi")
            if contract_path:
                documented_routes = openapi_routes(service_id, repo, contract_path, findings)
                service_routes = reconcile_provider_contract(
                    service_id, service_routes, documented_routes, findings,
                )
        elif framework == "nextjs":
            files = read_files(repo, iter_files(root, sources, EXTENSIONS["typescript"], excludes))
            service_routes = nextjs_routes(service_id, repo, service["root"], files, findings)
        else:
            raise ValueError(f"unsupported framework {framework} for {service_id}")
        routes.extend(service_routes)
        service_rows.append({
            "id": service_id,
            "framework": framework,
            "root": service["root"],
            "openapi": service.get("openapi"),
        })

    same_origin = {service["root"]: service_id for service_id, service in config["services"].items() if service["framework"] == "nextjs"}
    calls: list[Call] = []
    consumer_rows = []
    for consumer_id, consumer in sorted(config["consumers"].items()):
        root = repo / consumer["root"]
        language = consumer["language"]
        if not root.is_dir():
            findings.append(Finding("info" if consumer.get("optional") else "warning", "config_path_missing", f"consumer root {consumer['root']} not found", consumer["root"]))
            continue
        paths = iter_files(root, consumer.get("sources", ["."]), EXTENSIONS[language], excludes)
        files = read_files(repo, paths)
        consumer_calls: list[Call] = []
        if language == "typescript":
            project = ts_project(files)
            unsupported = []
            for relative, text in files:
                if re.search(r"(?<![\w$.])fetch\s*\(", text):
                    consumer_calls.extend(ts_extract_calls(consumer_id, relative, text, project, bindings, same_origin.get(consumer["root"])))
                if re.search(r"""from\s+['"]axios['"]|require\(\s*['"]axios['"]\s*\)""", text):
                    unsupported.append(relative)
            if unsupported:
                findings.append(Finding(
                    "warning", "unsupported_http_client",
                    f"{consumer_id}: {len(unsupported)} file(s) import axios, which is not modeled: {', '.join(unsupported[:5])}{' ...' if len(unsupported) > 5 else ''}",
                    unsupported[0],
                ))
        elif language == "python":
            settings = py_settings_envs(files)
            for relative, text in files:
                consumer_calls.extend(py_extract_calls(consumer_id, relative, text, bindings, settings))
        elif language == "php":
            for relative, text in files:
                if "Http::" in text:
                    consumer_calls.extend(php_extract_calls(consumer_id, root, relative, text, bindings))
        elif language == "go":
            for relative, text in files:
                if "net/http" in text or "http." in text:
                    consumer_calls.extend(go_extract_calls(consumer_id, relative, text, bindings))
        else:
            raise ValueError(f"unsupported language {language} for {consumer_id}")
        calls.extend(consumer_calls)
        consumer_rows.append({"id": consumer_id, "language": language, "root": consumer["root"], "files_scanned": len(files), "calls": len(consumer_calls)})

    link_calls(routes, calls, findings)

    for call in calls:
        if call.status == "unresolved":
            findings.append(Finding("warning", "unresolved_call", f"{call.via}: {call.reason}", call.file, call.line))
        elif call.status == "path_in_environment":
            findings.append(Finding("info", "path_in_environment", f"{call.via}: {call.reason}", call.file, call.line))

    for env in sorted(set(bindings.env_to_service) - bindings.observed):
        findings.append(Finding("info", "unused_binding", f"{env} ({bindings.env_to_service[env]}) is bound but no call resolves through it"))

    for route in routes:
        if not route.consumers:
            findings.append(Finding(
                "info", "unconsumed_route", f"{route.method} {route.path} ({route.service}) has no modeled consumer",
                route.file, route.line, service=route.service, method=route.method, path=route.path,
            ))

    accepted_path = config.get("accepted_findings")
    if accepted_path:
        apply_accepted(findings, load_accepted(repo, accepted_path), accepted_path)

    for row in service_rows:
        own = [route for route in routes if route.service == row["id"]]
        row["routes"] = len(own)
        row["consumed_routes"] = sum(1 for route in own if route.consumers)

    statuses = ["resolved", "orphan", "method_mismatch", "wrong_service", "unresolved", "external", "same_origin", "path_in_environment"]
    active = [finding for finding in findings if finding.accepted is None]
    summary = {
        "routes": len(routes),
        "calls": len(calls),
        "calls_by_status": {status: sum(1 for call in calls if call.status == status) for status in statuses},
        "findings_by_severity": {severity: sum(1 for finding in active if finding.severity == severity) for severity in SEVERITY_RANK},
        "accepted_findings": {
            category: sum(1 for finding in findings if finding.accepted and finding.accepted["category"] == category)
            for category in ACCEPTED_CATEGORIES
        },
    }

    def route_ref(route: Route | None) -> dict[str, Any] | None:
        if route is None:
            return None
        return {"service": route.service, "method": route.method, "path": route.path, "file": route.file, "line": route.line}

    return {
        "schema_version": SCHEMA_VERSION,
        "generator": "tools/ai/api-graph.py",
        "config": config_file.relative_to(repo).as_posix() if config_file.is_relative_to(repo) else str(config_file),
        "config_sha256": hashlib.sha256(raw).hexdigest(),
        "summary": summary,
        "services": service_rows,
        "consumers": consumer_rows,
        "routes": [
            {
                "service": route.service, "method": route.method, "path": route.path, "file": route.file,
                "line": route.line, "handler": route.handler, "module": route.module,
                "request_type": route.request_type, "response_type": route.response_type,
                "consumers": sorted(set(route.consumers)),
            }
            for route in sorted(routes, key=lambda item: (item.service, item.path, item.method, item.file, item.line))
        ],
        "calls": [
            {
                "consumer": call.consumer, "file": call.file, "line": call.line, "via": call.via,
                "method": call.method, "path": call.path, "status": call.status, "services": list(call.services),
                "reason": call.reason, "response_type": call.response_type, "route": route_ref(call.route),
            }
            for call in sorted(calls, key=lambda item: (item.consumer, item.file, item.line, item.path or "", item.method or "", item.reason or ""))
        ],
        "findings": [
            {
                "severity": finding.severity, "kind": finding.kind, "message": finding.message, "file": finding.file,
                "line": finding.line, "service": finding.service, "method": finding.method, "path": finding.path,
                "accepted": finding.accepted,
            }
            for finding in sorted(findings, key=lambda item: (SEVERITY_RANK[item.severity], item.kind, item.file or "", item.line or 0, item.message))
        ],
    }


ACCEPTED_KINDS = {"orphan_call": "call", "method_mismatch": "call", "wrong_service": "call", "unconsumed_route": "route"}
ACCEPTED_CATEGORIES = ("template", "planned", "infra")


def load_accepted(repo: Path, relative: str) -> list[AcceptedEntry]:
    """Load accepted findings; malformed entries are configuration errors, never silently ignored."""
    text = (repo / relative).read_text(encoding="utf-8")
    document = yaml.safe_load(text) or {}
    root = yaml.compose(text)
    items_node = next((value for key, value in root.value if key.value == "accepted"), None) if root is not None else None
    lines = [item.start_mark.line + 1 for item in items_node.value] if items_node is not None and items_node.value else []
    entries: list[AcceptedEntry] = []
    seen: set[tuple[str, str, str, str]] = set()
    for position, raw in enumerate(document.get("accepted", []) or []):
        where = f"{relative}:{lines[position] if position < len(lines) else '?'}"
        if not isinstance(raw, dict):
            raise ValueError(f"{where}: accepted entry must be a mapping")
        kind = raw.get("kind")
        if kind not in ACCEPTED_KINDS:
            raise ValueError(f"{where}: unsupported kind {kind!r}; allowed: {', '.join(sorted(ACCEPTED_KINDS))}")
        if raw.get("category") not in ACCEPTED_CATEGORIES:
            raise ValueError(f"{where}: unsupported category {raw.get('category')!r}; allowed: {', '.join(ACCEPTED_CATEGORIES)}")
        if not str(raw.get("reason") or "").strip():
            raise ValueError(f"{where}: reason is required")
        owner_field = "file" if ACCEPTED_KINDS[kind] == "call" else "service"
        missing = [name for name in (owner_field, "method", "path") if not raw.get(name)]
        if missing:
            raise ValueError(f"{where}: {kind} requires {', '.join(missing)}")
        key = (kind, str(raw[owner_field]), str(raw["method"]).upper(), str(raw["path"]))
        if key in seen:
            raise ValueError(f"{where}: duplicate accepted entry {' '.join(key)}")
        seen.add(key)
        entries.append(AcceptedEntry(kind, raw["category"], str(raw["reason"]).strip(), raw.get("reference"), key, lines[position] if position < len(lines) else 0))
    return entries


def apply_accepted(findings: list[Finding], entries: list[AcceptedEntry], relative: str) -> None:
    index = {entry.key: entry for entry in entries}
    for finding in findings:
        if finding.kind not in ACCEPTED_KINDS:
            continue
        owner = finding.file if ACCEPTED_KINDS[finding.kind] == "call" else finding.service
        entry = index.get((finding.kind, owner or "", (finding.method or "*").upper(), finding.path or ""))
        if entry:
            entry.matched += 1
            finding.accepted = {"category": entry.category, "reason": entry.reason, "reference": entry.reference}
    for entry in entries:
        if not entry.matched:
            kind, owner, method, path = entry.key
            findings.append(Finding(
                "error", "stale_accepted_finding",
                f"{kind} {method} {path} ({owner}) no longer occurs; remove the accepted entry",
                relative, entry.line,
            ))


def render_text(graph: dict[str, Any], output: str | None, verbose: bool) -> str:
    summary = graph["summary"]
    lines = [f"API contract graph (schema {graph['schema_version']})", ""]
    lines.append("Services:")
    for service in graph["services"]:
        lines.append(f"  {service['id']:<26} {service['routes']:>4} routes  {service['consumed_routes']:>4} consumed  ({service['framework']})")
    lines.append("Consumers:")
    for consumer in graph["consumers"]:
        lines.append(f"  {consumer['id']:<26} {consumer['calls']:>4} calls  {consumer['files_scanned']:>5} files  ({consumer['language']})")
    by_status = summary["calls_by_status"]
    lines.append("")
    lines.append("Calls: " + " | ".join(f"{status} {count}" for status, count in by_status.items()))
    severity = summary["findings_by_severity"]
    lines.append(f"Findings: {severity['error']} error, {severity['warning']} warning, {severity['info']} info")
    accepted = summary.get("accepted_findings", {})
    if any(accepted.values()):
        lines.append("Accepted: " + ", ".join(f"{category} {count}" for category, count in accepted.items()))
    shown = {"error", "warning"} | ({"info"} if verbose else set())
    grouped: dict[str, int] = {}
    for finding in graph["findings"]:
        if (finding["accepted"] and not verbose) or finding["severity"] not in shown:
            label = "accepted" if finding["accepted"] else finding["kind"]
            grouped[label] = grouped.get(label, 0) + 1
            continue
        location = f"{finding['file']}:{finding['line']}" if finding["file"] and finding["line"] else (finding["file"] or "-")
        label = f"ACCEPTED/{finding['accepted']['category']}" if finding["accepted"] else finding["severity"].upper()
        lines.append(f"  {label:<18} {finding['kind']:<26} {location}")
        lines.append(f"          {finding['message']}")
    if grouped:
        lines.append("  hidden (use --verbose): " + ", ".join(f"{kind} {count}" for kind, count in sorted(grouped.items())))
    if output:
        lines.append("")
        lines.append(f"Artifact: {output}")
    return "\n".join(lines) + "\n"


TYPE_DECLARATION_RE = re.compile(rf"export\s+(?:default\s+)?(?:abstract\s+)?(?:class|interface|type|enum)\s+({IDENT})")


def changed_paths(repo: Path, base: str) -> list[str]:
    commands = (
        [["git", "diff", "--name-only", f"{base}...HEAD"]]
        if base != "WORKTREE"
        else [
            ["git", "diff", "--name-only", "HEAD"],
            ["git", "ls-files", "--others", "--exclude-standard"],
        ]
    )
    paths: set[str] = set()
    for command in commands:
        output = subprocess.run(command, cwd=repo, text=True, capture_output=True, check=True).stdout
        paths.update(line.strip() for line in output.splitlines() if line.strip())
    return sorted(paths)


def impact(graph: dict[str, Any], repo: Path, selectors: list[str], diff_paths: list[str] | None = None) -> dict[str, Any]:
    """Resolve selectors (route, file, or type name) and changed files into affected routes and consumers."""
    diff_paths = diff_paths or []
    route_key = lambda item: (item["service"], item["method"], item["path"], item["file"], item["line"])
    consumers_by_route: dict[tuple, list[dict[str, Any]]] = {}
    for call in graph["calls"]:
        if call["route"]:
            consumers_by_route.setdefault(route_key(call["route"]), []).append(call)
    known_files = {route["file"] for route in graph["routes"]} | {call["file"] for call in graph["calls"]}
    matched_routes: dict[tuple, set[str]] = {}
    matched_calls: dict[tuple, set[str]] = {}
    unmatched: list[str] = []

    def by_type(name: str, label: str, service: str | None = None) -> bool:
        """Explicit type names match both sides; types from a provider file stay inside that service."""
        word = re.compile(rf"(?<![\w$]){re.escape(name)}(?![\w$])")
        hit = False
        for route in graph["routes"]:
            if service and route["service"] != service:
                continue
            if any(value and word.search(value) for value in (route["request_type"], route["response_type"])):
                matched_routes.setdefault(route_key(route), set()).add(label)
                hit = True
        if service:
            return hit
        for call in graph["calls"]:
            if call["response_type"] and word.search(call["response_type"]):
                matched_calls.setdefault((call["file"], call["line"], call["method"] or "", call["path"] or ""), set()).add(label)
                hit = True
        return hit

    service_roots = sorted(((row["root"].rstrip("/") + "/", row["id"]) for row in graph["services"]), key=lambda item: -len(item[0]))
    service_contracts = {
        row["openapi"]: row["id"]
        for row in graph["services"]
        if row.get("openapi")
    }

    explicit = set(selectors)
    for selector in [*selectors, *diff_paths]:
        text = selector.strip()
        hit = False
        route_selector = re.fullmatch(r"(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+)?(/\S*)", text, re.I)
        if route_selector:
            method = (route_selector.group(1) or "").upper()
            wanted = split_provider_path(route_selector.group(2))[0]
            for route in graph["routes"]:
                if tuple(segment for segment in route["path"].split("/") if segment) == wanted and method in ("", route["method"]):
                    matched_routes.setdefault(route_key(route), set()).add(text)
                    hit = True
        elif text in known_files or (repo / text).is_file():
            contract_owner = service_contracts.get(text)
            if contract_owner:
                for route in graph["routes"]:
                    if route["service"] == contract_owner:
                        matched_routes.setdefault(route_key(route), set()).add(text)
                        hit = True
            for route in graph["routes"]:
                if route["file"] == text:
                    matched_routes.setdefault(route_key(route), set()).add(text)
                    hit = True
            for call in graph["calls"]:
                if call["file"] == text:
                    matched_calls.setdefault((call["file"], call["line"], call["method"] or "", call["path"] or ""), set()).add(text)
                    hit = True
            source = repo / text
            owner = next((service_id for root, service_id in service_roots if text.startswith(root)), None)
            if owner and source.suffix in EXTENSIONS["typescript"] and source.is_file():
                for name in sorted(set(TYPE_DECLARATION_RE.findall(ts_strip_comments(source.read_text(encoding="utf-8", errors="replace"))))):
                    hit = by_type(name, f"{text}#{name}", owner) or hit
        elif re.fullmatch(IDENT, text):
            hit = by_type(text, text)
        if not hit and selector in explicit and text not in unmatched:
            unmatched.append(text)

    calls_index = {(call["file"], call["line"], call["method"] or "", call["path"] or ""): call for call in graph["calls"]}
    routes_out = []
    for route in sorted((route for route in graph["routes"] if route_key(route) in matched_routes), key=lambda item: (item["service"], item["path"], item["method"])):
        consumers = sorted(consumers_by_route.get(route_key(route), []), key=lambda item: (item["file"], item["line"]))
        routes_out.append({
            "service": route["service"], "method": route["method"], "path": route["path"], "file": route["file"],
            "line": route["line"], "handler": route["handler"], "matched_by": sorted(matched_routes[route_key(route)]),
            "consumers": [{"consumer": call["consumer"], "file": call["file"], "line": call["line"]} for call in consumers],
        })
    calls_out = []
    for key in sorted(matched_calls):
        call = calls_index[key]
        calls_out.append({
            "consumer": call["consumer"], "file": call["file"], "line": call["line"], "method": call["method"],
            "path": call["path"], "status": call["status"], "route": call["route"], "matched_by": sorted(matched_calls[key]),
        })
    consumer_files = {consumer["file"] for route in routes_out for consumer in route["consumers"]}
    return {
        "selectors": selectors,
        "diff_paths": diff_paths,
        "unmatched_selectors": unmatched,
        "summary": {"routes": len(routes_out), "calls": len(calls_out), "consumer_files": len(consumer_files)},
        "routes": routes_out,
        "calls": calls_out,
    }


def render_impact(result: dict[str, Any]) -> str:
    summary = result["summary"]
    lines = [f"API impact: {summary['routes']} route(s), {summary['consumer_files']} consumer file(s), {summary['calls']} call(s)"]
    if result["routes"]:
        lines.append("")
        lines.append("Routes and their consumers:")
        for route in result["routes"]:
            lines.append(f"  {route['method']} {route['path']}  [{route['service']}]  {route['file']}:{route['line']}")
            if not route["consumers"]:
                lines.append("      no modeled consumer")
            for consumer in route["consumers"]:
                lines.append(f"      <- {consumer['file']}:{consumer['line']}  ({consumer['consumer']})")
    if result["calls"]:
        lines.append("")
        lines.append("Calls and the routes they depend on:")
        for call in result["calls"]:
            target = f"{call['route']['service']} {call['route']['file']}:{call['route']['line']}" if call["route"] else call["status"]
            lines.append(f"  {call['method'] or '?'} {call['path'] or '?'}  {call['file']}:{call['line']}  -> {target}")
    if result["unmatched_selectors"]:
        lines.append("")
        lines.append("Unmatched selectors: " + ", ".join(result["unmatched_selectors"]))
    return "\n".join(lines) + "\n"


def slice_names(graph: dict[str, Any]) -> list[str]:
    modules = {route["module"] for route in graph["routes"] if route["module"]}
    modules |= {name for call in graph["calls"] if (name := module_of(call["file"]))}
    return sorted(modules | {row["id"] for row in graph["services"]} | {row["id"] for row in graph["consumers"]})


def build_slice(graph: dict[str, Any], repo: Path, name: str) -> dict[str, Any] | None:
    """Module or service view of the graph for agent preflight: provided routes, calls, cross-module edges, findings."""
    service_ids = {row["id"] for row in graph["services"]} | {row["id"] for row in graph["consumers"]}
    as_service = name in service_ids
    route_key = lambda item: (item["service"], item["method"], item["path"], item["file"], item["line"])
    routes = [route for route in graph["routes"] if (route["service"] == name if as_service else route["module"] == name)]
    member = (lambda call: call["consumer"] == name) if as_service else (lambda call: module_of(call["file"]) == name)
    calls = [call for call in graph["calls"] if member(call)]
    if not routes and not calls:
        return None
    keys = {route_key(route) for route in routes}
    consumers: dict[tuple, list[dict[str, Any]]] = {}
    for call in graph["calls"]:
        if call["route"] and route_key(call["route"]) in keys:
            consumers.setdefault(route_key(call["route"]), []).append(call)
    outside = lambda file: (not file.startswith(next((row["root"] for row in graph["consumers"] if row["id"] == name), "\0"))) if as_service else module_of(file) != name
    inbound = sorted(
        (call for route_calls in consumers.values() for call in route_calls if outside(call["file"])),
        key=lambda call: (call["file"], call["line"]),
    )
    outbound = [call for call in calls if call["route"] and route_key(call["route"]) not in keys]
    files = {route["file"] for route in routes} | {call["file"] for call in calls}
    findings = [
        finding for finding in graph["findings"]
        if finding["file"] in files or (finding["kind"] == "unconsumed_route" and any(
            route["method"] == finding["method"] and route["path"] == finding["path"] and route["service"] == finding["service"]
            for route in routes
        ))
    ]
    accepted_by_route = {
        (finding["service"], finding["method"], finding["path"]): finding["accepted"]["category"]
        for finding in findings if finding["kind"] == "unconsumed_route" and finding["accepted"]
    }
    return {
        "name": name,
        "scope": "service" if as_service else "module",
        "routes": [
            {**route, "consumers": [{"file": call["file"], "line": call["line"]} for call in sorted(consumers.get(route_key(route), []), key=lambda call: (call["file"], call["line"]))],
             "accepted": accepted_by_route.get((route["service"], route["method"], route["path"]))}
            for route in sorted(routes, key=lambda item: (item["file"], item["line"], item["method"], item["path"]))
        ],
        "calls": sorted(calls, key=lambda call: (call["file"], call["line"], call["method"] or "", call["path"] or "")),
        "inbound": [{"file": call["file"], "line": call["line"], "method": call["method"], "path": call["path"], "module": module_of(call["file"]) or call["consumer"]} for call in inbound],
        "outbound": [
            {"file": call["file"], "line": call["line"], "method": call["method"], "path": call["path"], "service": call["route"]["service"],
             "module": module_of(call["route"]["file"]) or call["route"]["service"]}
            for call in sorted(outbound, key=lambda call: (call["file"], call["line"]))
        ],
        "findings": findings,
        "cited_files": sorted(files | {call["file"] for call in inbound}),
    }


def short_names(paths: set[str]) -> dict[str, str]:
    """Shortest path suffix that is unique among the given paths."""
    names = {}
    for path in paths:
        parts = path.split("/")
        for size in range(1, len(parts) + 1):
            candidate = "/".join(parts[-size:])
            if sum(1 for other in paths if other == candidate or other.endswith("/" + candidate)) == 1:
                names[path] = candidate
                break
        else:
            names[path] = path
    return names


def render_slice(result: dict[str, Any], repo: Path) -> str:
    referenced = set(result["cited_files"]) | {call["route"]["file"] for call in result["calls"] if call["route"]}
    short = short_names(referenced)
    display = lambda path: path.removeprefix("implementations/")
    body: list[str] = []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for route in result["routes"]:
        grouped.setdefault(route["file"], []).append(route)
    body.append("## Provided routes")
    if not grouped:
        body.append("none")
    for file, routes in grouped.items():
        body.append(display(file))
        for route in routes:
            types = " ".join(part for part in (
                f"body:{route['request_type']}" if route["request_type"] else "",
                f"res:{route['response_type']}" if route["response_type"] else "",
            ) if part)
            if route["consumers"]:
                used = "used by " + ", ".join(f"{short[consumer['file']]}:{consumer['line']}" for consumer in route["consumers"])
            else:
                used = f"no consumer [accepted {route['accepted']}]" if route["accepted"] else "no consumer"
            body.append(f"  :{route['line']} {route['method']} {route['path']} -> {route['handler']}{' ' + types if types else ''} | {used}")
    body.append("")
    body.append("## Consumer files")
    calls_by_file: dict[str, list[dict[str, Any]]] = {}
    for call in result["calls"]:
        calls_by_file.setdefault(call["file"], []).append(call)
    if not calls_by_file:
        body.append("none")
    for file, calls in calls_by_file.items():
        external = sum(1 for call in calls if call["status"] == "external")
        body.append(f"{display(file)} ({len(calls)} call{'s' if len(calls) != 1 else ''}{f', {external} external' if external else ''})")
    attention = [call for call in result["calls"] if not call["route"] and call["status"] not in ("external",)]
    if attention:
        body.append("")
        body.append("## Calls needing attention")
        for call in attention:
            body.append(f"  {short[call['file']]}:{call['line']} {call['method'] or '?'} {call['path'] or '?'} -> {call['status']}: {call['reason']}")
    body.append("")
    body.append("## Cross-module edges")
    if not result["inbound"] and not result["outbound"]:
        body.append("none")
    for edge in result["inbound"]:
        body.append(f"  in  <- {edge['module']}: {short[edge['file']]}:{edge['line']} {edge['method'] or '?'} {edge['path']}")
    for edge in result["outbound"]:
        body.append(f"  out -> {edge['module']} ({edge['service']}): {short[edge['file']]}:{edge['line']} {edge['method'] or '?'} {edge['path']}")
    active = [finding for finding in result["findings"] if not finding["accepted"]]
    accepted: dict[str, int] = {}
    for finding in result["findings"]:
        if finding["accepted"]:
            accepted[finding["accepted"]["category"]] = accepted.get(finding["accepted"]["category"], 0) + 1
    body.append("")
    body.append("## Findings")
    body.append(
        f"active: {len(active)} | accepted: "
        + (", ".join(f"{category} {count}" for category, count in sorted(accepted.items())) or "0")
    )
    for finding in sorted(active, key=lambda item: (SEVERITY_RANK[item["severity"]], item["kind"], item["file"] or "", item["line"] or 0)):
        location = f"{short.get(finding['file'], finding['file'])}:{finding['line']}" if finding["file"] and finding["line"] else "-"
        body.append(f"  {finding['severity']} {finding['kind']} {location}: {finding['message']}")
    text = "\n".join(body) + "\n"
    cited_chars = sum((repo / file).stat().st_size for file in result["cited_files"] if (repo / file).is_file())
    header = [
        f"# API contract slice: {result['name']} ({result['scope']})",
        "Generated on demand from the current tree by tools/ai/api-graph.py; do not commit or reuse after edits.",
        "Paths are relative to implementations/. Open a cited file only when this slice lacks the detail you need.",
        f"routes {len(result['routes'])} | calls {len(result['calls'])} | inbound {len(result['inbound'])} | outbound {len(result['outbound'])} | cited files {len(result['cited_files'])}",
        f"size estimate (chars/4, not measured token usage): slice ~{(len(text) + 3) // 4} vs cited files ~{(cited_chars + 3) // 4} (lower bound: excludes searching for those files)",
        "",
    ]
    return "\n".join(header) + text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="JSON artifact path; '-' prints JSON to stdout")
    parser.add_argument("--fail-on", choices=("none", "error", "warning"), default="none")
    parser.add_argument("--verbose", action="store_true", help="list info and accepted findings in the text report")
    parser.add_argument("--impact", action="append", default=[], metavar="SELECTOR", help="route ('POST /path'), file path or type name; repeatable")
    parser.add_argument("--impact-diff", nargs="?", const="WORKTREE", metavar="BASE", help="use files changed since BASE (default: uncommitted changes)")
    parser.add_argument("--slice", metavar="MODULE_OR_SERVICE", help="agent context slice for a module (kanban) or service id")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="impact and slice output format")
    args = parser.parse_args(argv)

    repo = args.root.resolve()
    try:
        graph = build_graph(repo, args.config)
    except (OSError, ValueError, KeyError, yaml.YAMLError) as error:
        print(f"api-graph: configuration error: {error}", file=sys.stderr)
        return 2

    if args.slice is not None:
        result = build_slice(graph, repo, args.slice.strip()) if args.slice.strip() else None
        if result is None:
            print(f"api-graph: unknown or empty slice {args.slice!r}; available: {', '.join(slice_names(graph))}", file=sys.stderr)
            return 2
        sys.stdout.write(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n" if args.format == "json" else render_slice(result, repo))
        return 0

    if args.impact or args.impact_diff:
        diff_paths: list[str] = []
        if args.impact_diff:
            try:
                diff_paths = changed_paths(repo, args.impact_diff)
            except (OSError, subprocess.CalledProcessError) as error:
                print(f"api-graph: cannot read git diff: {error}", file=sys.stderr)
                return 2
        result = impact(graph, repo, list(args.impact), diff_paths)
        sys.stdout.write(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n" if args.format == "json" else render_impact(result))
        return 0

    document = json.dumps(graph, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if str(args.output) == "-":
        sys.stdout.write(document)
        output_label = None
    else:
        output = args.output if args.output.is_absolute() else repo / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(document, encoding="utf-8")
        output_label = output.relative_to(repo).as_posix() if output.is_relative_to(repo) else str(output)
        sys.stdout.write(render_text(graph, output_label, args.verbose))

    severity = graph["summary"]["findings_by_severity"]
    if args.fail_on == "error" and severity["error"]:
        return 1
    if args.fail_on == "warning" and (severity["error"] or severity["warning"]):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
