"""
Cifrado simétrico de secretos por tenant (API keys de IA, ADR-038).

La key en claro nunca se persiste ni se loguea: en Postgres queda sólo el token
Fernet (`tenant_llm_configs.api_key_encrypted`) y en la UI un hint de los
últimos 4 caracteres.

`ENCRYPTION_KEY` acepta dos formas:
- una clave Fernet válida tal cual (`Fernet.generate_key()`), o
- un string arbitrario (ej. `openssl rand -hex 32`), del que se deriva una
  clave con SHA-256 — así la misma variable sirve para STATE_SIGNING_KEY (ver
  oauth_config.py) sin obligar a un formato nuevo.

Rotar `ENCRYPTION_KEY` invalida los tokens ya guardados: hay que volver a
cargar cada key desde Ajustes › Proveedor de IA.
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


class SecretsConfigError(RuntimeError):
    """`ENCRYPTION_KEY` faltante o token que no se puede descifrar con ella."""


def _fernet() -> Fernet:
    raw = os.getenv("ENCRYPTION_KEY", "").strip()
    if not raw:
        raise SecretsConfigError("ENCRYPTION_KEY no configurada")

    try:
        return Fernet(raw.encode())
    except (ValueError, TypeError):
        derived = base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())
        return Fernet(derived)


def encrypt_secret(value: str) -> str:
    """Cifra `value` y devuelve el token Fernet (str)."""
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Descifra un token Fernet. Error explícito si cambió `ENCRYPTION_KEY`."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        raise SecretsConfigError(
            "No se pudo descifrar la key; ¿cambió ENCRYPTION_KEY?"
        )
