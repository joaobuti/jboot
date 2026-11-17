import pytest

from juridico_data.domain.cnj import infer_tribunal, normalize_cnj
from juridico_data.domain.errors import InvalidCnjError


def test_normalizes_valid_formatted_cnj_and_infers_tribunal() -> None:
    number = normalize_cnj("0001234-08.2023.8.26.0100")
    assert number == "00012340820238260100"
    assert infer_tribunal(number) == "TJSP"


@pytest.mark.parametrize(
    "value",
    ["0001234-56.2023.8.26.0100", "0001234082023826010", "not-a-process"],
)
def test_rejects_invalid_format_or_check_digits(value: str) -> None:
    with pytest.raises(InvalidCnjError):
        normalize_cnj(value)
