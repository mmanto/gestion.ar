# IUS System Prompt — Documentación de Implementación

## Qué es este archivo

`ius_system_prompt.json` es el system prompt estructurado del agente conversacional **IUS**, diseñado para ser inyectado como contexto en un modelo de IA (Claude, GPT-4o, etc.) para operar un embudo de conversión de servicios legales laborales.

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

## Campos que cambian con frecuencia

Todos en la sección `config`. **Editar solo aquí:**

| Campo | Valor actual | Descripción |
|-------|-------------|-------------|
| `precio_asesoria_mxn` | `2500` | Costo de la asesoría en pesos mexicanos |
| `plazos_legales.imss_meses` | `2` | Meses para demandar (trabajador con IMSS) |
| `plazos_legales.issste_meses` | `4` | Meses para demandar (trabajador con ISSSTE) |
| `plazos_legales.separacion_justificada_meses` | `1` | Plazo cuando el trabajador se separa por causas justificadas |
| `plazos_legales.prima_antiguedad_anios` | `1` | Plazo para reclamar prima de antigüedad |
| `plazos_legales.riesgo_trabajo_anios` | `2` | Plazo para indemnizaciones por accidente de trabajo |

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
