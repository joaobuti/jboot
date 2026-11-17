class JuridicoDataError(Exception):
    code = "provider_unavailable"
    status = 503
    title = "Official data provider unavailable"


class InvalidCnjError(JuridicoDataError):
    code = "validation_error"
    status = 422
    title = "Invalid CNJ process number"


class UnsupportedTribunalError(JuridicoDataError):
    code = "validation_error"
    status = 422
    title = "Unsupported tribunal"


class ProcessNotFoundError(JuridicoDataError):
    code = "process_not_found"
    status = 404
    title = "Process not found"


class RestrictedProcessError(JuridicoDataError):
    code = "process_restricted"
    status = 403
    title = "Process is restricted"


class ProviderRateLimitedError(JuridicoDataError):
    code = "provider_rate_limited"
    status = 429
    title = "Official data provider rate limited"


class ProviderTimeoutError(JuridicoDataError):
    code = "provider_timeout"
    status = 504
    title = "Official data provider timed out"


class ProviderSchemaError(JuridicoDataError):
    code = "provider_unavailable"
    status = 503
    title = "Official data provider returned an invalid response"
