"""
Validador del JSON de configuración libre de un agente (bot.config.ius_config).

No existe un schema fijo: cada bot define su propio JSON de comportamiento
(ver docs/ius_system_prompt.json para un ejemplo real, con secciones como
HOW_TO_USE, qualification, traffic_light, objection_handling, etc., que
varían por bot). Por eso la validación estructural sólo chequea invariantes
genéricos de JSON y los pocos campos que el runtime
(app/claude_service.py: build_effective_system_prompt/get_effective_welcome_message)
efectivamente lee (agent_identity.nombre/rol/presentacion). La validación
semántica delega en un modelo de lenguaje para detectar contradicciones
internas, ya que el contenido de negocio no es analizable con reglas fijas.
"""

import asyncio
import json
from typing import Any, Dict, List, TypedDict


class ValidationIssue(TypedDict):
    field: str
    message: str
    severity: str  # "error" | "warning" | "info"


def _issue(field: str, message: str, severity: str = "warning") -> ValidationIssue:
    return {"field": field, "message": message, "severity": severity}


def validate_structure(config: Dict[str, Any]) -> List[ValidationIssue]:
    """Chequeos genéricos de JSON + los campos que el runtime realmente usa."""
    issues: List[ValidationIssue] = []

    if not isinstance(config, dict):
        return [_issue("$", "La configuración debe ser un objeto JSON.", "error")]

    if not config:
        issues.append(_issue("$", "El JSON está vacío.", "warning"))

    identity = config.get("agent_identity")
    if identity is not None:
        if not isinstance(identity, dict):
            issues.append(_issue("agent_identity", "Debe ser un objeto.", "error"))
        else:
            for key in ("nombre", "rol", "presentacion"):
                value = identity.get(key)
                if not value or not isinstance(value, str) or not value.strip():
                    issues.append(_issue(
                        f"agent_identity.{key}",
                        f"'{key}' está vacío o ausente. Se usa en tiempo de ejecución "
                        "(mensaje de bienvenida y prompt efectivo del agente).",
                        "warning",
                    ))

    serialized = json.dumps(config, ensure_ascii=False)
    approx_tokens = len(serialized) // 4
    if approx_tokens > 8000:
        issues.append(_issue(
            "$",
            f"El JSON es grande (~{approx_tokens} tokens estimados por llamada). "
            "Se envía completo en cada mensaje; considerá recortar contenido poco usado.",
            "info",
        ))

    return issues


_SEMANTIC_AUDIT_PROMPT = """Sos un auditor de configuraciones de agentes conversacionales de IA.

Vas a recibir un JSON que se inyecta completo como instrucciones de sistema para un
agente de chat. Tu trabajo es detectar problemas que un chequeo automático de sintaxis
no puede ver, por ejemplo:
- Reglas o instrucciones que se contradicen entre sí.
- Referencias internas rotas (un campo que menciona el nombre de otra sección del
  mismo JSON, pero esa sección no existe o tiene otro nombre).
- Tono o tolerancias inconsistentes (ej. una sección pide un tono empático y otra
  permite respuestas agresivas o tajantes).
- Instrucciones ambiguas que podrían llevar al modelo a comportarse de forma
  impredecible.
- Prohibiciones que se contradicen con ejemplos o textos sugeridos en el propio JSON.

No opines sobre el negocio o dominio del agente (legal, ventas, salud, etc.), sólo
sobre la coherencia interna de las instrucciones.

Respondé ÚNICAMENTE con un JSON válido (sin markdown, sin texto adicional) con esta forma:
{"issues": [{"field": "<ruta aproximada, ej. objection_handling.esta_caro>", "message": "<problema detectado en español>", "severity": "warning" | "info"}]}

Si no encontrás problemas, respondé {"issues": []}."""


async def validate_semantics(config: Dict[str, Any], claude_client) -> List[ValidationIssue]:
    """
    Analiza el JSON con un modelo de lenguaje en busca de contradicciones o
    ambigüedades internas. `claude_client` es el cliente `anthropic.Anthropic`
    (síncrono) ya inicializado por ClaudeService.
    """
    payload = json.dumps(config, ensure_ascii=False, indent=2)

    try:
        response = await asyncio.to_thread(
            claude_client.messages.create,
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_SEMANTIC_AUDIT_PROMPT,
            messages=[{"role": "user", "content": payload}],
        )
        text = response.content[0].text.strip()
    except Exception as e:
        return [_issue("$", f"No se pudo ejecutar el análisis semántico: {e}", "error")]

    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        parsed = json.loads(text)
        raw_issues = parsed.get("issues", []) if isinstance(parsed, dict) else []
    except (ValueError, TypeError):
        return [_issue("$", "El modelo no devolvió un JSON válido para el análisis semántico.", "error")]

    issues: List[ValidationIssue] = []
    for item in raw_issues:
        if isinstance(item, dict) and item.get("message"):
            severity = item.get("severity")
            if severity not in ("error", "warning", "info"):
                severity = "info"
            issues.append(_issue(str(item.get("field", "$")), str(item["message"]), severity))

    return issues
