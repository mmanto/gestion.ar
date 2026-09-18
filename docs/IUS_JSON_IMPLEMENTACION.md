# IUS System Prompt — Documentación de Implementación

## Qué es este archivo

`ius_system_prompt.json` es el system prompt estructurado del agente conversacional **IUS**, diseñado para ser inyectado como contexto en un modelo de IA (Claude, GPT-4o, etc.) para operar un embudo de conversión de servicios legales laborales.

> **Fuente de verdad del prompt:** `docs/ius_legal_config.json` es la fuente de verdad del prompt que el agente usa en producción (`build_effective_system_prompt` en `backend/app/claude_service.py` lo inyecta completo). La descripción del embudo —los 9 pasos del árbol de decisión, los plazos en días naturales y las 32 reglas de semáforo— se **genera** en `docs/IUS_ARBOL_DECISION.md` con `scripts/build_ius_arbol_decision.py`. No editar ese Markdown a mano.
>
> `docs/ius_system_prompt.json` es la **plantilla**: el JSON con el que el panel carga la config de un agente nuevo. Describe el mismo embudo con otras secciones (`universe`, `qualification`, `traffic_light`, `objection_handling`…) y debe mantenerse coherente con el canónico, sin duplicar la fuente.

---

## Enfoque elegido: JSON Monolítico con Meta-Navegación

Se eligió este enfoque porque:

- No requiere infraestructura de orquestación backend
- Funciona directamente como system prompt
- Los campos dinámicos (precio, plazos) están aislados en una sección `config` para edición sin riesgo
- El bloque `HOW_TO_USE` al inicio actúa como índice de navegación que el modelo lee primero

**Costo estimado:** ~4,000–5,000 tokens por llamada (aceptable para conversaciones de calificación individual)

---

## Estructura del JSON

### Prompt canónico (`docs/ius_legal_config.json`)

Es el JSON que el runtime inyecta completo como system prompt. Además del guion conversacional (`flow`, 37 nodos) y las reglas, declara de forma explícita lo que antes sólo estaba en prosa:

```
ius_legal_config.json
├── HOW_TO_USE                 → Índice: orden de ejecución y regla de prioridad
├── agent_identity             → Nombre, rol, objetivo, presentación y aclaración de rol
├── config                     → Precio de la asesoría (único campo de monto)
├── plazos_legales             → Bandas en DÍAS NATURALES por institución + interrupción por conciliación
├── arbol_decision             → Los 9 pasos de evaluación y las 5 salidas terminales
├── matriz_documentacion       → Bloque de pruebas: FUERTE / MEDIO / DÉBIL / SIN PRUEBAS
├── senales_decision           → Señales positivas, límite y negativas
├── intencion_pago             → ALTA / DUDA / RECHAZO, evaluado por señales
├── descarte_inmediato         → Los 5 criterios que cierran el caso en rojo
├── acciones_por_color         → Acción de cierre de verde / amarillo / rojo
├── flow                       → Guion conversacional (nodos, opciones, rutas y campos)
├── rules                      → Reglas de conducta del agente
├── state_vars                 → Variables del caso y sus valores admitidos
├── priority                   → 32 reglas de color, umbrales de tiempo y notas de aplicación
├── triggers                   → Disparadores por palabra clave
├── forbidden                  → Prohibiciones y frase base obligatoria
└── registro_automatico_calificacion → Cuándo y cómo registrar el color (tool calling)
```

Cada paso del árbol declara su criterio, las variables que alimenta y los nodos del `flow` que lo implementan; cada regla de `priority.reglas` filtra por las mismas variables que el flujo captura, y esa correspondencia se verifica automáticamente (ver *Validación* más abajo).

### Plantilla para configs nuevas (`docs/ius_system_prompt.json`)

```
ius_system_prompt.json
├── HOW_TO_USE          → Índice de navegación para el modelo
├── config              → Campos dinámicos: precio y plazos legales
├── agent_identity      → Nombre, rol, objetivo y tono de IUS
├── universe            → Definición de problema laboral y 10 tipos de casos
├── law_routing         → IMSS → LFT | ISSSTE → LFTSE | Burocrática → Art.123 Apt.B
├── qualification       → 4 pasos: plazo → documentación → viabilidad → descarte
├── traffic_light       → Semáforo ROJO / AMARILLO / VERDE con condiciones y acciones
├── client_profile      → Señales de intención de pago (alta / duda / rechazo)
├── persuasion          → Secuencia de 7 pasos (solo para VERDE y AMARILLO)
├── objection_handling  → 5 tipos de objeción con respuestas y cierre
├── responses           → Copy completo: empático, advertencias, transiciones, por semáforo
└── restrictions        → Reglas de lo que la IA NUNCA debe decir o prometer
```

---

## Validación

Tres chequeos, en orden de cercanía al artefacto:

| Chequeo | Comando | Qué detecta |
|---|---|---|
| Estructura del JSON canónico | `docker compose exec app pytest tests/test_ius_legal_config.py -v` | Deriva: reglas que filtran por variables que ningún nodo del flow escribe, valores fuera de los admitidos, ramas del árbol que no resuelven, plazos incoherentes |
| Documento del árbol | `python3 scripts/build_ius_arbol_decision.py` | Que `docs/IUS_ARBOL_DECISION.md`/`.html` correspondan al JSON vigente |
| Comportamiento del modelo | `python scripts/test_ius_casos_semaforo.py --enable-auto-colors` | Que el agente registre el color esperado en los 23 casos de `docs/qa/ius_casos_semaforo.txt` |

Los chequeos estructurales corren sólo para configs que declaran `arbol_decision`: los `ius_config` libres de otros tenants (ERMA, pachoteayuda) no se validan contra el esquema de iUS.

---

## Campos que cambian con frecuencia

**Prompt canónico (`docs/ius_legal_config.json`).** Editar sólo acá y regenerar la documentación:

| Campo | Valor actual | Descripción |
|-------|-------------|-------------|
| `config.precio_asesoria_mxn` | `2500` | Costo de la asesoría en pesos mexicanos. Único campo de monto: no duplicar el precio en otra sección |
| `plazos_legales.conteo` | `días naturales (lunes a domingo)` | El plazo se computa en días, no en meses: 2 meses = 60 días y 4 meses = 120 días |
| `plazos_legales.imss.total_dias` | `60` | Plazo total (LFT, Apartado A del Art. 123): 0-40 favorable / 41-60 límite / 61+ prescripción |
| `plazos_legales.issste.total_dias` | `120` | Plazo total (LFTSE, Apartado B del Art. 123): 0-90 favorable / 91-120 límite / 121+ prescripción |
| `plazos_legales.otros.separacion_causa_justificada_meses` | `1` | Separación por causa justificada |
| `plazos_legales.otros.riesgo_de_trabajo_anios` | `2` | Riesgo de trabajo |
| `plazos_legales.otros.declaracion_beneficiarios_anios` | `2` | Declaración de beneficiarios |
| `plazos_legales.otros.prima_antiguedad_anios` | `1` | Prima de antigüedad |

**Interrupción del plazo:** se interrumpe al ingresar la solicitud de conciliación ante el Centro Federal o Local de Conciliación Laboral y se retoma al día siguiente de la emisión de la Constancia de No Conciliación. Un convenio celebrado ante el Centro no cierra el caso por sí mismo: lo que lo cierra es que el plazo posterior a la Constancia ya esté vencido.

**Plantilla (`docs/ius_system_prompt.json`).** Los mismos datos viven en su `config`, con los meses conservados además de los días: `precio_asesoria_mxn`, `plazos_legales` (meses y años), `conteo_plazos`, `imss_dias`, `issste_dias` e `interrupcion_conciliacion` (mismo texto que el canónico). No es una segunda fuente: se mantiene coherente.

---

## Flujo de conversación del embudo

```
Usuario describe su situación
        ↓
[universe] ¿Es un problema laboral?
        ↓ No → Salida educativa
        ↓ Sí
[law_routing] ¿IMSS, ISSSTE, o burocrático?
        ↓
[qualification] Paso 1: ¿Está en plazo legal?
        ↓ No → ROJO (prescripción)
        ↓ Sí
[qualification] Paso 2: ¿Qué documentación tiene?
        ↓
[qualification] Paso 3: Evaluar viabilidad del caso
        ↓
[client_profile] Evaluar intención de pago
        ↓
[traffic_light] Asignar semáforo
        ↓
   ROJO              AMARILLO              VERDE
Cierre empático    Nutrir + objeciones   Persuasión 7 pasos
                         ↓                     ↓
              [objection_handling]    Conectar con abogado
```

---

## Lógica del semáforo

| Color | Condiciones | Acción |
|-------|-------------|--------|
| 🔴 ROJO | Fuera de plazo legal, sin pruebas, o rechazo explícito a pagar | Cerrar con empatía, no insistir en venta |
| 🟡 AMARILLO | En plazo, pero duda en pagar o documentación incompleta | Nutrir, reducir fricción, resolver objeciones |
| 🟢 VERDE | Asunto sólido, en plazo, con pruebas, dispuesto a pagar | Secuencia de persuasión → cierre → abogado |

---

## Objeciones manejadas

| Señal del usuario | Clave en JSON |
|-------------------|---------------|
| "Está caro" | `objection_handling.esta_caro` |
| "Lo voy a pensar" | `objection_handling.lo_voy_a_pensar` |
| "No tengo dinero" | `objection_handling.no_tengo_dinero` |
| "Quiero pensarlo más" | `objection_handling.quiero_pensarlo_mas` |
| "Otro abogado me dijo que es fácil" | `objection_handling.otro_abogado_dijo_facil` |

---

## Restricciones críticas de la IA

La IA **nunca** debe:
- Garantizar resultados ("Vas a ganar tu caso")
- Dar un diagnóstico legal definitivo ("Esto es un despido injustificado")
- Actuar como abogado ("Debes demandar")
- Mencionar montos de recuperación ("Te corresponden X pesos")
- Decir que la asesoría es gratuita o que el abogado contactará sin pago previo

La frase base obligatoria ante dudas legales:
> *"Para darte una respuesta precisa, es necesario que un abogado revise tu caso a detalle."*

---

## Cómo usar este JSON como system prompt

### Claude API (Python)
```python
import json
import anthropic

with open("ius_system_prompt.json", "r") as f:
    system_data = json.load(f)

system_prompt = f"""
Eres IUS, un asistente de IA legal laboral. 
Sigue estrictamente las instrucciones del siguiente JSON de configuración:

{json.dumps(system_data, ensure_ascii=False, indent=2)}
"""

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=system_prompt,
    messages=[{"role": "user", "content": "Me despidieron ayer sin explicación"}]
)
```

### Claude API con prompt caching (recomendado para producción)
```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"}  # Cache del system prompt
        }
    ],
    messages=[{"role": "user", "content": mensaje_usuario}]
)
```

El prompt caching reduce el costo ~90% en el system prompt para conversaciones múltiples.

---

## Alternativas de estructura exploradas

| Enfoque | Tokens/llamada | Infraestructura necesaria |
|---------|---------------|--------------------------|
| **A: Monolítico (implementado)** | ~4,000-5,000 | Ninguna |
| B: Modular por fase | ~800-1,200 | Backend con estado de sesión |
| C: Grafo de estados | ~2,000-8,000 | Backend con máquina de estados |

El Enfoque A es el punto de partida correcto. Migrar a B o C cuando: el volumen de conversaciones genere costos relevantes de tokens, o cuando se necesite comportamiento más determinista en casos complejos.

---

## Fuente

Generado a partir del documento: `CONVERSACIÓN GENERAL.docx`  
Fecha de implementación: 2026-04-30
