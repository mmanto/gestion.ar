"""
Tests unitarios de build_effective_system_prompt (app/claude_service.py) --
regresión del bug donde CUALQUIER bot con ius_config recibía el literal fijo
"Eres IUS, un asistente de IA legal laboral" sin importar su propio rubro
(ver agent_identity dentro de su ius_config). No requiere Mongo/Redis/Docker.
"""

import inspect

from app.claude_service import build_effective_system_prompt
from app.models.bot import BotConfig


def _ius_config(agent_identity=None, **extra):
    config = {"HOW_TO_USE": "Seguir el orden definido acá."}
    if agent_identity is not None:
        config["agent_identity"] = agent_identity
    config.update(extra)
    return config


def test_ius_bot_uses_its_own_identity():
    bot_config = BotConfig(ius_config=_ius_config({
        "nombre": "IUS",
        "rol": "Asistente de IA legal laboral",
        "presentacion": "Hola, soy IUS.",
        "aclaracion_de_rol": "IUS no es un abogado litigante.",
    }))

    prompt = build_effective_system_prompt(bot_config)

    assert "Eres IUS, Asistente de IA legal laboral." in prompt
    assert "IUS no es un abogado litigante." in prompt


def test_erma_bot_does_not_inherit_ius_identity():
    bot_config = BotConfig(ius_config=_ius_config({
        "nombre": "ERMA",
        "rol": "Asistente de salud",
        "presentacion": "Hola, soy ERMA.",
    }))

    prompt = build_effective_system_prompt(bot_config)

    assert "Eres ERMA, Asistente de salud." in prompt
    assert "legal laboral" not in prompt
    assert "Eres IUS" not in prompt


def test_missing_agent_identity_falls_back_to_generic_line():
    bot_config = BotConfig(ius_config=_ius_config(agent_identity=None))

    prompt = build_effective_system_prompt(bot_config)

    assert prompt.startswith("Eres un asistente virtual de este negocio.")
    assert "legal laboral" not in prompt
    assert "IUS" not in prompt


def test_source_no_longer_hardcodes_ius_legal_identity():
    source = inspect.getsource(build_effective_system_prompt)
    assert "Eres IUS, un asistente de IA legal laboral" not in source
