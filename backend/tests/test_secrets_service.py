"""Cifrado de las API keys de IA por tenant (ADR-038).

No requiere DB ni red: valida el contrato de `secrets_service` sobre
`ENCRYPTION_KEY`.
"""

import pytest
from cryptography.fernet import Fernet

from app.services.secrets_service import (
    SecretsConfigError,
    decrypt_secret,
    encrypt_secret,
)


def test_roundtrip_with_arbitrary_key(monkeypatch):
    # String arbitrario (no Fernet): se deriva la clave con SHA-256.
    monkeypatch.setenv("ENCRYPTION_KEY", "openssl-rand-hex-32-cualquiera")
    token = encrypt_secret("sk-or-v1-secreta")

    assert token != "sk-or-v1-secreta"
    assert "sk-or-v1-secreta" not in token
    assert decrypt_secret(token) == "sk-or-v1-secreta"


def test_roundtrip_with_valid_fernet_key(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", Fernet.generate_key().decode())
    token = encrypt_secret("sk-ant-api03-xyz")
    assert decrypt_secret(token) == "sk-ant-api03-xyz"


def test_missing_key_raises_config_error(monkeypatch):
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    with pytest.raises(SecretsConfigError):
        encrypt_secret("sk-test")

    monkeypatch.setenv("ENCRYPTION_KEY", "   ")
    with pytest.raises(SecretsConfigError):
        decrypt_secret("token")


def test_corrupted_token_reports_key_rotation(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", "clave-vieja")
    token = encrypt_secret("sk-test")

    # Rotar la key invalida los tokens ya guardados: el mensaje tiene que
    # decirlo explícitamente (es la causa del 99% de los casos).
    monkeypatch.setenv("ENCRYPTION_KEY", "clave-nueva")
    with pytest.raises(SecretsConfigError) as exc:
        decrypt_secret(token)
    assert "ENCRYPTION_KEY" in str(exc.value)

    monkeypatch.setenv("ENCRYPTION_KEY", "clave-vieja")
    with pytest.raises(SecretsConfigError):
        decrypt_secret("no-es-un-token-fernet")
