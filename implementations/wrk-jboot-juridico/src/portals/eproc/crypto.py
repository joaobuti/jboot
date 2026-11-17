from __future__ import annotations

import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_SECRET = os.environ.get("JBOOT_IDENTITY_JWT_SECRET", "dev-only-jboot-identity-secret-change-before-production")


def _derive_key(client_id: str) -> bytes:
    return hmac.new(_SECRET.encode(), client_id.encode(), hashlib.sha256).digest()


def encrypt_session(client_id: str, plaintext: str) -> bytes:
    key = _derive_key(client_id)
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    # AESGCM.encrypt returns ciphertext+tag (tag appended, 16 bytes)
    ct_plus_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    ciphertext = ct_plus_tag[:-16]
    tag = ct_plus_tag[-16:]
    # Wire format: iv(12) || tag(16) || ciphertext — matches BFF CryptoService
    return iv + tag + ciphertext


def decrypt_session(client_id: str, blob: bytes) -> str:
    key = _derive_key(client_id)
    aesgcm = AESGCM(key)
    iv = blob[:12]
    tag = blob[12:28]
    ciphertext = blob[28:]
    plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
    return plaintext.decode()
