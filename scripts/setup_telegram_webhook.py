#!/usr/bin/env python3
"""
Script to configure Telegram webhook
"""

import os
import sys
import requests
from pathlib import Path

# Add parent directory to path to import from backend
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv

# Load environment variables
load_dotenv("backend/.env")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET")

if not BOT_TOKEN:
    print("❌ Error: TELEGRAM_BOT_TOKEN not found in backend/.env")
    sys.exit(1)

if not WEBHOOK_SECRET:
    print("⚠️  Warning: TELEGRAM_WEBHOOK_SECRET not found, using default")
    WEBHOOK_SECRET = "telegram_secret_change_this"

print("=" * 60)
print("🤖 TELEGRAM WEBHOOK CONFIGURATION")
print("=" * 60)

# Get webhook URL from user
print("\nIngresa la URL de tu webhook.")
print("Ejemplos:")
print("  - Producción: https://tu-dominio.com/api/webhook/telegram")
print("  - Desarrollo (ngrok): https://abc123.ngrok.io/api/webhook/telegram")
print()

webhook_url = input("URL del webhook: ").strip()

if not webhook_url:
    print("❌ Error: URL del webhook es requerida")
    sys.exit(1)

if not webhook_url.startswith("https://"):
    print("❌ Error: La URL debe usar HTTPS")
    sys.exit(1)

if not webhook_url.endswith("/api/webhook/telegram"):
    print("⚠️  Advertencia: La URL debería terminar en /api/webhook/telegram")
    confirm = input("¿Continuar de todas formas? (s/n): ")
    if confirm.lower() != 's':
        sys.exit(0)

print("\n📡 Configurando webhook...")

# Set webhook
set_url = f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook"

payload = {
    "url": webhook_url,
    "secret_token": WEBHOOK_SECRET,
    "allowed_updates": ["message"],
    "drop_pending_updates": True
}

try:
    response = requests.post(set_url, json=payload, timeout=30)
    result = response.json()

    if result.get("ok"):
        print("✅ Webhook configurado exitosamente!")
        print(f"   URL: {webhook_url}")
    else:
        print(f"❌ Error configurando webhook: {result.get('description')}")
        sys.exit(1)

except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

# Get webhook info
print("\n📊 Verificando configuración...")

info_url = f"https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo"

try:
    response = requests.get(info_url, timeout=30)
    info = response.json()

    if info.get("ok"):
        result = info.get("result", {})
        print("\n" + "=" * 60)
        print("INFORMACIÓN DEL WEBHOOK")
        print("=" * 60)
        print(f"URL: {result.get('url')}")
        print(f"Tiene secreto: {result.get('has_custom_certificate', False)}")
        print(f"Updates pendientes: {result.get('pending_update_count', 0)}")
        print(f"Último error: {result.get('last_error_message', 'Ninguno')}")
        print(f"Máximo conexiones: {result.get('max_connections', 40)}")
        print("=" * 60)
    else:
        print(f"⚠️  No se pudo obtener información del webhook")

except Exception as e:
    print(f"⚠️  Error obteniendo información: {e}")

# Get bot info
print("\n🤖 Información del bot...")

me_url = f"https://api.telegram.org/bot{BOT_TOKEN}/getMe"

try:
    response = requests.get(me_url, timeout=30)
    me_info = response.json()

    if me_info.get("ok"):
        bot = me_info.get("result", {})
        print("\n" + "=" * 60)
        print("INFORMACIÓN DEL BOT")
        print("=" * 60)
        print(f"ID: {bot.get('id')}")
        print(f"Nombre: {bot.get('first_name')}")
        print(f"Username: @{bot.get('username')}")
        print(f"Puede unirse a grupos: {bot.get('can_join_groups', False)}")
        print(f"Puede leer mensajes de grupo: {bot.get('can_read_all_group_messages', False)}")
        print("=" * 60)
        print(f"\n✅ ¡Todo listo! Busca @{bot.get('username')} en Telegram")
        print("   Envía /start para probar el bot")
    else:
        print(f"⚠️  No se pudo obtener información del bot")

except Exception as e:
    print(f"⚠️  Error obteniendo información del bot: {e}")

print("\n" + "=" * 60)
print("✅ CONFIGURACIÓN COMPLETADA")
print("=" * 60)
