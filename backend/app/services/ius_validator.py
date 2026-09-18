"""
Validador del JSON de configuración libre de un agente (bot.config.ius_config).

No existe un schema fijo: cada bot define su propio JSON de comportamiento
(ver docs/ius_system_prompt.json para un ejemplo real, con secciones como
HOW_TO_USE, qualification, traffic_light, objection_handling, etc., que
varían por bot). Por eso la validación estructural sólo chequea invariantes
genéricos de JSON y los pocos campos que el runtime
(app/claude_service.py: build_effective_system_prompt/get_effective_welcome_message)
efectivamente lee (agent_identity.nombre/rol/presentacion). agent_identity es
obligatorio (severidad "error" si falta): build_effective_system_prompt lo usa
para declarar la identidad propia de CADA bot en el prompt efectivo -- sin él
cae a un fallback genérico, y un bot nunca debe quedar en producción sin su
propia identidad declarada (evita que un bot se presente con el rubro/identidad
de otro tenant). Además, para las configs que declaran el esquema IUS
(`arbol_decision`) corre `_validate_ius_semaforo`, que sí valida el contenido del
semáforo -- plazos, reglas contra state_vars, ids del árbol y matriz -- porque en
ese caso la forma es conocida y la deriva (reglas que filtran por variables que
ningún nodo del flow escribe, valores fuera de los admitidos) es un error
detectable. La validación semántica delega en un modelo de lenguaje para detectar
contradicciones internas del resto del contenido, que no es analizable con reglas
fijas.
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
    if identity is None:
        issues.append(_issue(
            "agent_identity",
            "Falta 'agent_identity'. Es obligatorio: sin él, el prompt efectivo del "
            "agente usa una identidad genérica en vez de la propia de este bot.",
            "error",
        ))
    elif not isinstance(identity, dict):
        issues.append(_issue("agent_identity", "Debe ser un objeto.", "error"))
    else:
        for key in ("nombre", "rol", "presentacion"):
            value = identity.get(key)
            if not value or not isinstance(value, str) or not value.strip():
                issues.append(_issue(
                    f"agent_identity.{key}",
                    f"'{key}' está vacío o ausente. Es obligatorio: se usa en tiempo de "
                    "ejecución (mensaje de bienvenida y prompt efectivo del agente) para "
                    "que este bot se presente con su propia identidad, no con la de otro tenant.",
                    "error",
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

    issues.extend(_validate_ius_semaforo(config))

    return issues


_IUS_COLORS = ("verde", "amarillo", "rojo")

# Campos de una regla de priority.reglas que NO filtran sobre state_vars: son
# metadatos de la propia regla (ver priority.note y state_vars en el JSON).
_IUS_RULE_META_FIELDS = frozenset({
    "color", "nombre", "texto", "condicion", "evaluar", "pendiente_validacion_legal", "precedencia",
})


def _validate_ius_semaforo(config: Dict[str, Any]) -> List[ValidationIssue]:
    """Invariantes del prompt de semáforo IUS (plazos, reglas, árbol, matriz).

    Sólo corre para las configs que declaran el esquema IUS (`arbol_decision`):
    el mismo validador sirve a los JSON libres de otros tenants (ERMA,
    pachoteayuda), que no deben empezar a reportar errores por secciones que su
    agente no tiene. Detecta la deriva que un chequeo de sintaxis no ve: reglas
    que filtran por variables que ningún nodo del flow escribe, valores fuera de
    los admitidos, ids del árbol que no resuelven y plazos incoherentes.
    """
    issues: List[ValidationIssue] = []

    if not isinstance(config.get("arbol_decision"), dict):
        # Config libre de otro tenant (ERMA, pachoteayuda): no tiene semáforo.
        return issues

    plazos = config.get("plazos_legales")
    if not isinstance(plazos, dict):
        issues.append(_issue(
            "plazos_legales",
            "Falta 'plazos_legales'. El árbol lo consulta ANTES de evaluar viabilidad: "
            "sin bandas de días el modelo no puede ubicar el caso en favorable / límite / prescripción.",
            "error",
        ))
    else:
        for institucion in ("imss", "issste", "sin_registro"):
            banda = plazos.get(institucion)
            path = f"plazos_legales.{institucion}"
            if not isinstance(banda, dict):
                issues.append(_issue(path, "Falta la banda de plazos de este régimen (los pasos del árbol discriminan por régimen, no por 'tiene o no tiene seguridad social').", "error"))
                continue
            limites = [banda.get(k) for k in ("favorable_hasta_dia", "limite_hasta_dia", "prescripcion_desde_dia")]
            if not all(isinstance(x, int) and not isinstance(x, bool) for x in limites):
                issues.append(_issue(
                    path,
                    "favorable_hasta_dia, limite_hasta_dia y prescripcion_desde_dia deben ser enteros (días naturales).",
                    "error",
                ))
            elif not limites[0] < limites[1] < limites[2]:
                issues.append(_issue(
                    path,
                    f"Las bandas deben cumplir favorable < límite < prescripción; hoy son {limites}.",
                    "error",
                ))

    priority = config.get("priority")
    reglas = priority.get("reglas") if isinstance(priority, dict) else None
    umbrales = set()
    if isinstance(priority, dict) and isinstance(priority.get("umbrales"), list):
        umbrales = {
            u["nombre"] for u in priority["umbrales"]
            if isinstance(u, dict) and isinstance(u.get("nombre"), str)
        }

    state_vars = config.get("state_vars")
    if not isinstance(state_vars, dict):
        issues.append(_issue(
            "state_vars",
            "Debe ser un objeto variable -> valores admitidos (separados por '|'), o las reglas no "
            "pueden validarse contra los datos que el flow captura.",
            "error",
        ))
        state_vars = {}

    if not isinstance(reglas, list) or not reglas:
        issues.append(_issue("priority.reglas", "Falta la lista de reglas que determina el color.", "error"))
        reglas = []

    vistos: Dict[str, int] = {}
    pendientes = 0
    for i, regla in enumerate(reglas):
        path = f"priority.reglas[{i}]"
        if not isinstance(regla, dict):
            issues.append(_issue(path, "Cada regla debe ser un objeto.", "error"))
            continue

        nombre = regla.get("nombre")
        if not isinstance(nombre, str) or not nombre.strip():
            issues.append(_issue(f"{path}.nombre", "Falta 'nombre'. Es la referencia estable de la regla.", "error"))
        elif nombre in vistos:
            issues.append(_issue(
                f"{path}.nombre",
                f"El nombre '{nombre}' ya lo usa priority.reglas[{vistos[nombre]}]: las reglas deben ser "
                "identificables sin ambigüedad.",
                "error",
            ))
        else:
            vistos[nombre] = i

        if regla.get("color") not in _IUS_COLORS:
            issues.append(_issue(
                f"{path}.color",
                f"'color' debe ser uno de {list(_IUS_COLORS)}; hoy es {regla.get('color')!r}.",
                "error",
            ))
        if not str(regla.get("texto") or "").strip():
            issues.append(_issue(f"{path}.texto", "Falta 'texto': es la explicación que el modelo lee al aplicar la regla.", "error"))
        if regla.get("pendiente_validacion_legal"):
            pendientes += 1

        for campo, valor in regla.items():
            if campo in _IUS_RULE_META_FIELDS:
                continue
            if campo not in state_vars:
                issues.append(_issue(
                    f"{path}.{campo}",
                    f"'{campo}' no es una variable declarada en state_vars: ningún nodo del flow la "
                    "escribe, así que la regla nunca podría cumplirse.",
                    "error",
                ))
                continue
            admitidos = {v.strip() for v in str(state_vars[campo]).split("|")}
            for v in (valor if isinstance(valor, list) else [valor]):
                if v is None or v == "cualquiera":
                    continue
                if not isinstance(v, str) or (v not in admitidos and v not in umbrales):
                    issues.append(_issue(
                        f"{path}.{campo}",
                        f"El valor {v!r} no está entre los admitidos para '{campo}' "
                        f"({sorted(admitidos | umbrales)}).",
                        "error",
                    ))

    if pendientes:
        issues.append(_issue(
            "priority.reglas",
            f"{pendientes} reglas marcadas 'pendiente_validacion_legal': están activas en el prompt y "
            "definen color sin respaldo legal revisado.",
            "warning",
        ))

    # El orden es lo que hace determinista la clasificación: el prompt recorre las
    # reglas por 'precedencia' ascendente y aplica la primera que coincida. Sin
    # precedencia única y contigua, dos reglas empatan y el modelo elige distinto
    # en cada conversación (medido: 11 de 23 casos no reproducibles, ver
    # docs/IUS_SEMAFORO_INFORME_2026-09-11.md §9).
    precedencias = [r.get("precedencia") for r in reglas if isinstance(r, dict)]
    if any(p is None for p in precedencias):
        issues.append(_issue(
            "priority.reglas",
            "Hay reglas sin 'precedencia'. Es obligatoria: define el orden de evaluación y sin ella "
            "dos reglas que empatan se resuelven distinto en cada conversación.",
            "error",
        ))
    elif sorted(precedencias) != list(range(1, len(precedencias) + 1)):
        issues.append(_issue(
            "priority.reglas",
            f"'precedencia' debe ser única y contigua de 1 a {len(precedencias)}; hoy es {sorted(precedencias)}.",
            "error",
        ))

    for i, regla in enumerate(reglas):
        if not isinstance(regla, dict):
            continue
        # Un filtro con valor 'cualquiera' (o null) no filtra nada: cuenta como
        # condición real sólo si restringe algún valor.
        efectivos = [
            k for k, v in regla.items()
            if k not in _IUS_RULE_META_FIELDS
            and any(x is not None and x != "cualquiera" for x in (v if isinstance(v, list) else [v]))
        ]
        if not efectivos and not str(regla.get("condicion") or "").strip():
            issues.append(_issue(
                f"priority.reglas[{i}]",
                f"'{regla.get('nombre')}' no tiene ningún filtro ni 'condicion': no hay forma de saber "
                "cuándo se cumple, así que el modelo decide a criterio.",
                "error",
            ))

    # Las excepciones nombradas en el texto de una regla tienen que ir antes que ella,
    # o el orden las vuelve inalcanzables.
    for excepcion, exceptuada in (
        ("issste_renuncia_impugnada_con_evidencia", "renuncia_voluntaria_firmada"),
        ("renuncia_con_promesa_liquidacion_incumplida", "renuncia_voluntaria_firmada"),
        ("imss_seis_siete_semanas_renuncia_huella_voluntaria", "renuncia_voluntaria_firmada"),
        ("issste_catorce_quince_semanas_renuncia_huella_voluntaria", "renuncia_voluntaria_firmada"),
    ):
        a = next((r.get("precedencia") for r in reglas if isinstance(r, dict) and r.get("nombre") == excepcion), None)
        b = next((r.get("precedencia") for r in reglas if isinstance(r, dict) and r.get("nombre") == exceptuada), None)
        if isinstance(a, int) and isinstance(b, int) and a > b:
            issues.append(_issue(
                "priority.reglas",
                f"'{excepcion}' (precedencia {a}) tiene que ir ANTES que '{exceptuada}' ({b}): su texto la "
                "declara excepción de esa regla.",
                "error",
            ))

    arbol = config.get("arbol_decision")
    pasos = arbol.get("pasos") if isinstance(arbol, dict) else None
    terminales = arbol.get("terminales") if isinstance(arbol, dict) else None
    flow = config.get("flow")
    flow_ids = {n.get("id") for n in flow if isinstance(n, dict)} if isinstance(flow, list) else set()

    if not isinstance(pasos, list) or not pasos:
        issues.append(_issue("arbol_decision.pasos", "Falta la lista de pasos del árbol de evaluación.", "error"))
        pasos = []
    if not isinstance(terminales, list):
        issues.append(_issue("arbol_decision.terminales", "Falta la lista de salidas terminales del árbol.", "error"))
        terminales = []

    terminal_ids = set()
    for j, term in enumerate(terminales):
        path = f"arbol_decision.terminales[{j}]"
        if not isinstance(term, dict) or not term.get("id"):
            issues.append(_issue(f"{path}.id", "Cada terminal del árbol necesita 'id'.", "error"))
            continue
        terminal_ids.add(term["id"])
        if term.get("color") not in _IUS_COLORS:
            issues.append(_issue(f"{path}.color", f"'color' debe ser uno de {list(_IUS_COLORS)}; hoy es {term.get('color')!r}.", "error"))
        for nodo in term.get("nodos_flow") or []:
            if nodo not in flow_ids:
                issues.append(_issue(f"{path}.nodos_flow", f"El nodo '{nodo}' no existe en flow.", "error"))

    paso_ids = set()
    for j, paso in enumerate(pasos):
        path = f"arbol_decision.pasos[{j}]"
        if not isinstance(paso, dict) or not paso.get("id"):
            issues.append(_issue(f"{path}.id", "Cada paso del árbol necesita 'id'.", "error"))
            continue
        pid = paso["id"]
        if pid in paso_ids:
            issues.append(_issue(f"{path}.id", f"El id '{pid}' está repetido: los destinos del árbol serían ambiguos.", "error"))
        paso_ids.add(pid)
        for nodo in paso.get("nodos_flow") or []:
            if nodo not in flow_ids:
                issues.append(_issue(f"{path}.nodos_flow", f"El nodo '{nodo}' no existe en flow.", "error"))

    for j, paso in enumerate(pasos):
        if not isinstance(paso, dict) or not paso.get("id"):
            continue
        path = f"arbol_decision.pasos[{j}]"
        siguiente = paso.get("siguiente")
        if siguiente is not None and siguiente not in paso_ids:
            issues.append(_issue(f"{path}.siguiente", f"'{siguiente}' no es un paso del árbol.", "error"))
        no_branch = paso.get("no")
        if isinstance(no_branch, dict):
            goto = no_branch.get("goto")
            if goto not in terminal_ids and goto not in paso_ids:
                issues.append(_issue(f"{path}.no.goto", f"'{goto}' no es un paso ni un terminal del árbol.", "error"))

        ramas = paso.get("ramas")
        if ramas is None:
            continue
        if not isinstance(ramas, list) or not ramas:
            issues.append(_issue(
                f"{path}.ramas",
                "'ramas' debe ser una lista no vacía: un paso que discrimina por valores de una variable los "
                "declara uno por uno, o sus casos quedan sin camino ni particularidad legal.",
                "error",
            ))
            continue
        # La variable que el paso captura: si declara una sola, sus valores admitidos
        # son las ramas esperadas -- una por cada valor, sin dejar ninguna afuera.
        datos = [d for d in (paso.get("datos") or []) if isinstance(state_vars.get(d), str)]
        admitidos = (
            {v.strip() for v in state_vars[datos[0]].split("|") if v.strip()}
            if len(datos) == 1 else set()
        )
        declarados = set()
        for k, rama in enumerate(ramas):
            rpath = f"{path}.ramas[{k}]"
            if not isinstance(rama, dict):
                issues.append(_issue(rpath, "Cada rama debe ser un objeto con 'etiqueta', 'valor' y 'goto'.", "error"))
                continue
            goto = rama.get("goto")
            if goto not in terminal_ids and goto not in paso_ids:
                issues.append(_issue(f"{rpath}.goto", f"'{goto}' no es un paso ni un terminal del árbol.", "error"))
            if not str(rama.get("etiqueta") or "").strip():
                issues.append(_issue(f"{rpath}.etiqueta", "Falta 'etiqueta': es el texto de la rama en el diagrama y en la tabla.", "error"))
            valor = rama.get("valor")
            if not isinstance(valor, str) or not valor.strip():
                issues.append(_issue(f"{rpath}.valor", "Falta 'valor': es el valor de la variable que activa la rama.", "error"))
                continue
            declarados.add(valor)
            if admitidos and valor not in admitidos:
                issues.append(_issue(
                    f"{rpath}.valor",
                    f"El valor {valor!r} no está entre los admitidos para '{datos[0]}' ({sorted(admitidos)}).",
                    "error",
                ))
        if admitidos and admitidos - declarados:
            issues.append(_issue(
                f"{path}.ramas",
                f"El paso discrimina por '{datos[0]}' pero no declara rama para {sorted(admitidos - declarados)}: "
                "esos casos quedan sin camino documentado ni particularidad legal.",
                "error",
            ))

    acciones = config.get("acciones_por_color")
    if not isinstance(acciones, dict):
        issues.append(_issue("acciones_por_color", "Falta la acción de cierre por color.", "error"))
    else:
        for color in _IUS_COLORS:
            accion = acciones.get(color)
            if not isinstance(accion, dict):
                issues.append(_issue(f"acciones_por_color.{color}", "Falta la acción de cierre de este color.", "error"))
                continue
            nodo = accion.get("nodo_flow")
            if nodo not in flow_ids:
                issues.append(_issue(f"acciones_por_color.{color}.nodo_flow", f"El nodo '{nodo}' no existe en flow.", "error"))

    descarte = config.get("descarte_inmediato")
    if isinstance(descarte, dict):
        for j, criterio in enumerate(descarte.get("criterios") or []):
            if not isinstance(criterio, dict):
                continue
            for nombre in str(criterio.get("regla", "")).split("|"):
                nombre = nombre.strip()
                if nombre and nombre not in vistos:
                    issues.append(_issue(
                        f"descarte_inmediato.criterios[{j}].regla",
                        f"'{nombre}' no es ninguna regla de priority.reglas.",
                        "error",
                    ))

    matriz = config.get("matriz_documentacion")
    if isinstance(matriz, dict):
        for j, bloque in enumerate(matriz.get("bloques") or []):
            if isinstance(bloque, dict) and bloque.get("color") not in _IUS_COLORS:
                issues.append(_issue(
                    f"matriz_documentacion.bloques[{j}].color",
                    f"'color' debe ser uno de {list(_IUS_COLORS)}; hoy es {bloque.get('color')!r}.",
                    "error",
                ))

    intencion = config.get("intencion_pago")
    if isinstance(intencion, dict):
        for nivel in ("alta", "duda", "rechazo"):
            señales = (intencion.get(nivel) or {}).get("señales") if isinstance(intencion.get(nivel), dict) else None
            if not isinstance(señales, list) or not señales:
                issues.append(_issue(
                    f"intencion_pago.{nivel}.señales",
                    "Falta la lista de señales: la intención de pago se evalúa por señales, nunca preguntando.",
                    "error",
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
