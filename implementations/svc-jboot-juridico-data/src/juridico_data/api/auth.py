from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from juridico_data.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


def require_service_caller(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if (
        not settings.identity_jwt_secret.get_secret_value()
    ):
        raise HTTPException(status_code=503, detail="Service configuration is incomplete")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing service bearer token")
    try:
        claims: dict[str, Any] = jwt.decode(
            credentials.credentials,
            settings.identity_jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience=settings.service_audience,
            issuer=settings.identity_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid service bearer token") from exc
    caller = claims.get("client_id") or claims.get("sub")
    if not isinstance(caller, str) or caller not in settings.caller_allowlist:
        raise HTTPException(status_code=403, detail="Service caller is not allowed")
    if claims.get("typ") != "service_access":
        raise HTTPException(status_code=401, detail="Invalid service token type")
    return caller
