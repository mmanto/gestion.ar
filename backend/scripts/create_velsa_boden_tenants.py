#!/usr/bin/env python3
"""
Alta de los tenants demo productivos VELSA y BÖDEN SEED.

Crea (idempotente por domain) para cada tenant:
  - Tenant  -> name/domain/branding/plan y settings.chat_channel_id
  - User    -> <slug>_admin (role=admin)
  - Bot     -> un agente con el prompt de venta del rubro
  - Channel -> canal web activo (el chat de la landing chat-only)
  - tenant_llm_configs -> OpenRouter + deepseek-v4-flash con OPENROUTER_API_KEY

La landing de cada dominio (SPA frontend-tenant) muestra únicamente el chat
del agente cuando `tenant.settings.chat_channel_id` existe.

Uso (dentro del contenedor del backend):

    docker compose --env-file .env.prod \
      -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml \
      exec -T app python scripts/create_velsa_boden_tenants.py

Contraseñas: se toman de VELSA_ADMIN_PASSWORD / BODEN_ADMIN_PASSWORD; si no
están en el entorno se genera una aleatoria y se imprime UNA sola vez. Un
usuario ya existente nunca se resetea (una corrida posterior no duplica ni
pisa credenciales).
"""

import asyncio
import os
import secrets
import sys
import uuid

from sqlalchemy import select

from app.auth_service import get_password_hash
from app.db.database import AsyncSessionLocal
from app.db.models import Bot, Channel, Tenant, User
from app.models.tenant import TenantLLMConfigUpdate
from app.services.tenant_llm_service import save_tenant_llm_config, validate_llm_credentials

LLM_PROVIDER = "openrouter"
LLM_MODEL = "deepseek-v4-flash"
DEFAULT_PLAN_ID = "plan_000000000000"  # Plan Pro mensual

VELSA_SYSTEM_PROMPT = """
Eres el asesor comercial de VELSA, distribuidora mayorista de artículos de papelería en México. Guías al cliente desde su primer mensaje hasta levantar su pedido completo en esta misma conversación, sin fricción y con venta sugestiva.

TONO
- Profesional, entusiasta de los negocios, empático, rápido y persuasivo.
- Español de México. Frases cortas, viñetas y emojis; nada de bloques densos.
- El pedido se levanta y se coordina por este mismo chat: no derives a una tienda en línea ni a otro canal.

CATÁLOGO Y PRECIOS (cajas cerradas de 50 piezas)
- MAPED (premium): $1,250 MXN por caja. Margen para el papelero: 12%.
- BACO (tradicional): $1,000 MXN por caja. Margen para el papelero: 18%.
- VELSA (marca propia): $800 MXN por caja. Margen para el papelero: 35% neto. Es 20% más económica que BACO y la más rentable.
Complementos VELSA: cuadernos $1,200 por caja; colores $1,500 por caja; mochilas $2,200 por paquete.
No inventes productos, precios, existencias ni promociones fuera de esta lista.

LOGÍSTICA
- Envío GRATIS desde $15,000 MXN.
- Debajo de ese monto, envío fijo preferencial de $190 MXN, entrega express de 24 a 32 horas en los 32 estados.
- Siempre desglosa el envío entre el total de piezas: "$190 entre 600 piezas = $0.31 por pieza".
- El CP sólo confirma la entrega: la tarifa de envío es fija.

EMBUDO (orden estricto)
1) APERTURA Y CALIFICACIÓN
Saluda y pregunta de forma abierta qué artículos busca surtir hoy. Si menciona juegos de geometría (o cualquier otro artículo), pregunta de inmediato cuántas cajas necesita, recordando que cada caja trae 50 piezas. No pidas datos del negocio ni RFC en este paso.
Filtro de curiosos: si pide piezas sueltas o menudeo, explicá amablemente que VELSA es exclusivo para mayoristas y que el pedido se coordina por este mismo chat. No transfieras a una persona y cerrá la conversación con amabilidad.

2) REVELACIÓN DE VALOR Y COMPARACIÓN
Cuando el cliente indique la cantidad de cajas, mostrá una tabla de texto simple (columnas separadas por |, sin sintaxis markdown de tablas) con: Marca | Inversión Total | % de Margen | Ganancia Neta. Calculá para la cantidad pedida las tres marcas y resaltá a VELSA como recomendación estrella, mostrando cuánto ahorra en la compra y cuánto más gana al vender. Preguntá si prefiere asegurar stock con VELSA o ajustar la cantidad de cajas.
Ejemplo con 12 cajas: MAPED $15,000 / 12% / $1,800; BACO $12,000 / 18% / $2,160; VELSA $9,600 / 35% / $3,360. VELSA ahorra $2,400 frente a BACO y $5,400 frente a MAPED, y deja $1,200 más de ganancia que BACO y $1,560 más que MAPED.

3) LOGÍSTICA Y VENTA SUGESTIVA
Cuando acepte VELSA, pedí su Código Postal para confirmar la entrega. Al recibirlo:
- Informá la tarifa de $190 MXN y desglosala en centavos por pieza según el total de piezas del pedido.
- Mostrá una barra de progreso con emojis hacia la meta de envío gratis de $15,000 MXN, por ejemplo: [██████░░░░] $9,600 / $15,000 MXN, e indicá cuánto falta.
- Ofrecé complementos de temporada VELSA: cuadernos $1,200 la caja, colores $1,500 la caja, mochilas $2,200 el paquete.
- Cerrá con tres alternativas escritas en líneas separadas:
  [ Agregar uno de los artículos sugeridos ]
  [ Buscar otro artículo del catálogo ]
  [ Seguir con la compra y cerrar el pedido ]

4) BIFURCACIÓN FISCAL
Si decide cerrar, preguntá si necesita factura electrónica emitida hoy.
- SÍ: solicitá RFC, Razón Social, Dirección Completa de Entrega y Correo Electrónico.
- NO: explicá que puede facturarse después, con fecha límite el último día del mes en curso. Solicitá únicamente Nombre de quien recibe, Dirección completa de entrega, Correo electrónico y Teléfono.

5) CIERRE Y TRASPASO
Mostrá un resumen final ordenado con: Número de Orden simulado (#MY-2026-XXXX, cuatro dígitos), Producto seleccionado, Costo de Envío, Total Neto a pagar y Tiempo de entrega (24-32 hrs).
Informá que la orden quedó levantada con éxito y que en menos de 2 minutos un asesor se conectará en este mismo chat, única y exclusivamente para darle las cuentas bancarias y coordinar el pago (transferencia o depósito en tiendas departamentales). No prometas otra cosa ni transfieras antes de este paso.

ENTRADAS INESPERADAS
- Si pide precios de MAPED o BACO, dalos al instante y agregá abajo la comparación con VELSA.
- Si dice "está caro" o "déjame pensarlo", ofrecé un 5% de descuento adicional exclusivo sobre VELSA para cuidar su flujo de efectivo y pedí su CP para diluir el envío.
- Si pregunta por algo fuera del catálogo, decí que por ahora sólo manejás los artículos listados y ofrecé los complementos.

FORMATO
- Sin markdown (sin **, sin encabezados con #). Tablas en texto simple con columnas separadas por |.
- Máximo 8 líneas por mensaje salvo la tabla comparativa o el resumen final.
"""

BODEN_SYSTEM_PROMPT = """
Eres el asesor agropecuario de BÖDEN SEED. Vendés semilla híbrida de jitomate KING F1 a productores de México.

IDIOMA Y TONO
- Español de México. Tratá siempre de "Usted": respetuoso, claro, empático y directo.
- Usá términos del campo mexicano: parcela, ciclo, surco, ejido, sobres, superficie.
- Prohibido usar: "técnico", "estancado", "malla", "rancho", "CRM".
- Máximo 3 o 4 líneas por mensaje. No satures con bloques largos.
- Sin markdown: sin ** y sin encabezados con #. Viñetas simples y emojis moderados.

PRODUCTO Y LOGÍSTICA (KING F1)
- Semilla híbrida de jitomate Roma indeterminado.
- Sobre con 5,000 semillas certificadas de alta genética.
- Precio fijo: $1,000 MXN netos por sobre.
- Envío 100% GRATIS a todo México, entrega express de 24 a 32 horas.
- Rendimiento base: 240 a 310 toneladas por hectárea.
- Densidad recomendada básica: 5 sobres por hectárea a campo abierto.
- No inventes otras variedades, precios, rendimientos ni promociones.

BIENVENIDA Y FILTRO
Preguntá de forma amable si ya conoce las variedades de BÖDEN SEED o si busca una recomendación para su próximo ciclo.

CAMINO DIRECTO (PRODUCTOR EXPERIMENTADO)
Si pide KING F1 directamente, dale el precio de $1,000 MXN por sobre y mencioná de inmediato el envío gratis en 24-32 horas. Mostrá empatía breve por su inversión ("sabemos que cada peso invertido en la tierra cuenta") y pasá directo a preguntar cuántos sobres necesita y el Estado de entrega para cerrar.

CAMINO CONSULTIVO (DIAGNÓSTICO CORTO)
Si pide recomendación o describe su situación, analizá su zona y variables. Si menciona virus, plagas o pérdidas pasadas, activá el Escudo de KING F1 con empatía ("Lamento lo de su cosecha pasada; sabemos el esfuerzo que se juega en cada surco").
Mencioná que KING F1 tiene protección genética fuerte: alta resistencia a Fusarium y Nematodos, y resistencia intermedia al Virus del Rizado Amarillo (mosquita blanca) y al Bronceado. No des más datos técnicos salvo que los pida expresamente.

RECOLECCIÓN DE DATOS Y TRASPASO
Al aceptar el pedido, pedí en un solo mensaje corto: Nombre, Dirección de entrega (calle, número, ejido/colonia, municipio, estado) y Teléfono. Ofrecé omitir el RFC si no necesita factura fiscal en ese momento.
Finalizá confirmando la orden de forma muy sencilla y anunciando que el equipo de oficina se conectará en este chat para pasarle las cuentas bancarias de la empresa para depósito o transferencia. No intervienen personas antes de este paso.
"""

TENANTS = [
    {
        "domain": "velsa.intellify.pro",
        "name": "VELSA",
        "admin_username": "velsa_admin",
        "password_env": "VELSA_ADMIN_PASSWORD",
        "bot_name": "Asesor VELSA",
        "business_type": "papeleria_mayorista",
        "bot_description": "Venta mayorista de papelería y juegos de geometría",
        "channel_name": "Chat web VELSA",
        "branding": {
            "primary_color": "#1D4ED8",
            "tagline": "Papelería al mayoreo",
            "industry": "generico",
        },
        "welcome_message": (
            "👋 ¡Bienvenido a VELSA! Somos tu proveedor de papelería al mayoreo. "
            "¿Qué productos necesitás surtir hoy?"
        ),
        "fallback_message": "No te entendí. ¿Me repetís qué necesitás surtir?",
        "system_prompt": VELSA_SYSTEM_PROMPT,
    },
    {
        "domain": "boden.intellify.pro",
        "name": "BÖDEN SEED",
        "admin_username": "boden_admin",
        "password_env": "BODEN_ADMIN_PASSWORD",
        "bot_name": "Asesor BÖDEN SEED",
        "business_type": "semillas_jitomate",
        "bot_description": "Venta de semilla híbrida de jitomate KING F1",
        "channel_name": "Chat web BÖDEN SEED",
        "branding": {
            "primary_color": "#166534",
            "tagline": "Semillas de jitomate",
            "industry": "generico",
        },
        "welcome_message": (
            "Buen día. ¿Ya conoce las variedades de BÖDEN SEED o gusta que le "
            "recomiende una para su próximo ciclo?"
        ),
        "fallback_message": "No le entendí. ¿Podría repetirlo, por favor?",
        "system_prompt": BODEN_SYSTEM_PROMPT,
    },
]


async def ensure_tenant(spec: dict, api_key: str) -> None:
    domain = spec["domain"]
    admin_username = spec["admin_username"]
    password = os.environ.get(spec["password_env"]) or secrets.token_urlsafe(12)

    async with AsyncSessionLocal() as session:
        # 1) Tenant (idempotente por domain; se conserva el dominio existente)
        result = await session.execute(select(Tenant).where(Tenant.domain == domain))
        tenant = result.scalars().first()
        if tenant is None:
            tenant = Tenant(
                tenant_id=f"tenant_{uuid.uuid4().hex[:12]}",
                name=spec["name"],
                domain=domain,
                status="active",
                plan_id=DEFAULT_PLAN_ID,
                branding=spec["branding"],
                settings={},
            )
            session.add(tenant)
            await session.flush()
            print(f"Tenant creado: {tenant.tenant_id} (domain={domain})")
        else:
            tenant.name = spec["name"]
            tenant.status = "active"
            tenant.plan_id = DEFAULT_PLAN_ID
            tenant.branding = spec["branding"]
            print(f"Tenant ya existía: {tenant.tenant_id} (domain={domain}) — actualizado")
        tenant_id = tenant.tenant_id

        # 2) Usuario admin (nunca se resetea la contraseña de uno existente)
        user = await session.get(User, admin_username)
        password_report = "(sin cambios)"
        if user is None:
            session.add(
                User(
                    username=admin_username,
                    hashed_password=get_password_hash(password),
                    tenant_id=tenant_id,
                    role="admin",
                    disabled=False,
                )
            )
            password_report = password
            print(f"Usuario creado: {admin_username}")
        else:
            print(f"Usuario ya existía: {admin_username}")

        # 3) Bot del tenant
        bot_result = await session.execute(
            select(Bot).where(Bot.tenant_id == tenant_id, Bot.name == spec["bot_name"])
        )
        bot = bot_result.scalars().first()
        config = {
            "system_prompt": spec["system_prompt"],
            "welcome_message": spec["welcome_message"],
            "fallback_message": spec["fallback_message"],
            "max_tokens": 1024,
            "temperature": 0.3,
            "use_rag": False,
        }
        if bot is None:
            bot = Bot(
                bot_id=f"bot_{uuid.uuid4().hex[:12]}",
                owner_id=admin_username,
                tenant_id=tenant_id,
                name=spec["bot_name"],
                description=spec["bot_description"],
                business_type=spec["business_type"],
                status="active",
                config=config,
                channel_ids=[],
                total_clients=0,
                total_conversations=0,
                total_messages=0,
                metadata_={},
            )
            session.add(bot)
            await session.flush()
            print(f"Bot creado: {bot.bot_id}")
        else:
            bot.description = spec["bot_description"]
            bot.business_type = spec["business_type"]
            bot.status = "active"
            bot.config = config
            print(f"Bot ya existía: {bot.bot_id} — configuración actualizada")
        bot_id = bot.bot_id

        # 4) Canal web del tenant (chat de la landing chat-only)
        channel_result = await session.execute(
            select(Channel).where(
                Channel.bot_id == bot_id,
                Channel.channel_type == "web",
                Channel.owner_username.is_(None),
            )
        )
        channel = channel_result.scalars().first()
        if channel is None:
            channel = Channel(
                channel_id=f"channel_{uuid.uuid4().hex[:12]}",
                bot_id=bot_id,
                tenant_id=tenant_id,
                channel_type="web",
                name=spec["channel_name"],
                status="active",
                web_config=None,
                webhook_url=None,
                total_messages_received=0,
                total_messages_sent=0,
                metadata_={},
            )
            session.add(channel)
            await session.flush()
            print(f"Canal web creado: {channel.channel_id}")
        else:
            print(f"Canal web ya existía: {channel.channel_id}")
        channel.name = spec["channel_name"]
        channel.status = "active"
        channel.webhook_url = f"wss://{domain}/ws/chat/channel/{channel.channel_id}"

        # 5) Vincular el canal al bot
        if channel.channel_id not in (bot.channel_ids or []):
            bot.channel_ids = [*(bot.channel_ids or []), channel.channel_id]

        # 6) La landing de este dominio renderiza el chat de ese canal
        tenant.settings = {**(tenant.settings or {}), "chat_channel_id": channel.channel_id}

        await session.commit()

        # 8) Config de IA del tenant (obligatoria: sin ella el bot no responde)
        await save_tenant_llm_config(
            tenant_id,
            TenantLLMConfigUpdate(
                provider=LLM_PROVIDER, model=LLM_MODEL, api_key=api_key
            ),
            updated_by="system",
        )

        print("─" * 60)
        print(f"{spec['name']}")
        print(f"  tenant_id  : {tenant_id}")
        print(f"  domain     : {domain}")
        print(f"  bot_id     : {bot_id}")
        print(f"  channel_id : {channel.channel_id}")
        print(f"  usuario    : {admin_username}")
        print(f"  password   : {password_report}")
        print(f"  IA         : {LLM_PROVIDER} / {LLM_MODEL}")
        print("─" * 60)


async def main() -> None:
    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        sys.exit("Falta OPENROUTER_API_KEY en el entorno del contenedor app")

    # Aborta antes de escribir nada si la key/modelo no sirven.
    try:
        validate_llm_credentials(LLM_PROVIDER, api_key, LLM_MODEL)
    except Exception as exc:  # LLMProviderError u otro fallo del proveedor
        sys.exit(f"Credenciales de IA inválidas ({LLM_PROVIDER}/{LLM_MODEL}): {exc}")
    print(f"Credenciales de IA validadas: {LLM_PROVIDER} / {LLM_MODEL}")

    failed = False
    for spec in TENANTS:
        try:
            await ensure_tenant(spec, api_key)
        except Exception as exc:
            failed = True
            print(f"ERROR en {spec['domain']}: {exc}")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
