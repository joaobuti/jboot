import re

from juridico_data.domain.errors import InvalidCnjError

CNJ_FORMATTED = re.compile(r"^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$")
CNJ_DIGITS = re.compile(r"^\d{20}$")


def normalize_cnj(value: str) -> str:
    stripped = value.strip()
    if CNJ_FORMATTED.fullmatch(stripped):
        digits = stripped.translate(str.maketrans("", "", "-."))
    elif CNJ_DIGITS.fullmatch(stripped):
        digits = stripped
    else:
        raise InvalidCnjError

    base = f"{digits[:7]}{digits[9:]}00"
    expected = 98 - (int(base) % 97)
    if int(digits[7:9]) != expected:
        raise InvalidCnjError
    return digits


def infer_tribunal(cnj: str) -> str | None:
    branch, code = cnj[13], cnj[14:16]
    if branch == "1":
        return "STF"
    if branch == "3":
        return "STJ"
    if branch == "4":
        return f"TRF{int(code)}"
    if branch == "5":
        return f"TRT{int(code)}"
    if branch == "6":
        return f"TRE{_state_suffix(code)}" if _state_suffix(code) else None
    if branch == "7":
        return "STM"
    if branch == "8":
        suffix = _state_suffix(code)
        return f"TJ{suffix}" if suffix else None
    if branch == "9":
        return {"13": "TJMMG", "21": "TJMRS", "26": "TJMSP"}.get(code)
    return None


def _state_suffix(code: str) -> str | None:
    return {
        "01": "AC", "02": "AL", "03": "AP", "04": "AM", "05": "BA",
        "06": "CE", "07": "DF", "08": "ES", "09": "GO", "10": "MA",
        "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB",
        "16": "PR", "17": "PE", "18": "PI", "19": "RJ", "20": "RN",
        "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE",
        "26": "SP", "27": "TO",
    }.get(code)
