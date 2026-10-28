"""Unit tests de las tools del canal de voz (ADR-034)."""

import asyncio
import re
from types import SimpleNamespace

from app.models.bot import BotConfig
from app.services.prospect_auto_qualify_service import QUALIFICATION_TOOL_NAME
from app.services.voice_session_service import (
    RAG_TOOL_NAME,
    build_voice_functions,
    execute_function,
)


def _bot(**config):
    return SimpleNamespace(bot_id="bot_test", config=BotConfig(**config))


def _client():
    return SimpleNamespace(client_id="client_test", color_semaforo=None, notas=None)


def test_rag_tool_added_when_enabled():
    tools, _dispatch = asyncio.run(
        build_voice_functions(_bot(use_rag=True), _client(), "client_test")
    )
    names = [tool["name"] for tool in tools]
    assert RAG_TOOL_NAME in names


def test_rag_tool_absent_when_disabled():
    tools, _dispatch = asyncio.run(
        build_voice_functions(_bot(use_rag=False), _client(), "client_test")
    )
    assert RAG_TOOL_NAME not in [tool["name"] for tool in tools]


def test_qualification_defers_until_end_of_turn():
    tools, _dispatch = asyncio.run(
        build_voice_functions(
            _bot(use_rag=False, auto_qualify_colors=["verde"]), _client(), "client_test"
        )
    )
    by_name = {tool["name"]: tool for tool in tools}
    assert by_name[QUALIFICATION_TOOL_NAME]["defer_until_eot"] is True


def test_all_tool_names_match_deepgram_regex():
    tools, _dispatch = asyncio.run(
        build_voice_functions(_bot(use_rag=True), _client(), "client_test")
    )
    for tool in tools:
        assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", tool["name"])


def test_unknown_tool_returns_error_json():
    _tools, dispatch = asyncio.run(
        build_voice_functions(_bot(use_rag=False), None, None)
    )
    payload = asyncio.run(execute_function(dispatch, "no_existe", {}))
    assert '"error"' in payload
