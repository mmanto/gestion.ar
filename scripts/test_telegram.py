#!/usr/bin/env python3
"""
Tests para el servicio de Telegram
"""

import os
import sys
from pathlib import Path
import asyncio
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv("backend/.env")

BASE_URL = "http://localhost:8000"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

async def test_telegram_setup():
    """Test telegram setup endpoint"""
    print("\n" + "=" * 60)
    print("TEST: Telegram Setup Info")
    print("=" * 60)

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/telegram/setup")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")

async def test_send_message():
    """Test sending a message"""
    print("\n" + "=" * 60)
    print("TEST: Send Telegram Message")
    print("=" * 60)

    # Get chat_id from user
    chat_id = input("Ingresa tu chat_id de Telegram: ")

    if not chat_id:
        print("⚠️  Skipping send test - no chat_id provided")
        return

    payload = {
        "chat_id": int(chat_id),
        "text": "🤖 Mensaje de prueba desde el bot!\n\nEste es un test del endpoint /api/telegram/send",
        "parse_mode": "Markdown"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/api/telegram/send", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")

async def test_bot_info():
    """Test getting bot info directly from Telegram API"""
    print("\n" + "=" * 60)
    print("TEST: Bot Info (Direct Telegram API)")
    print("=" * 60)

    if not BOT_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN not configured")
        return

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getMe"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        result = response.json()

        if result.get("ok"):
            bot = result.get("result", {})
            print(f"✅ Bot ID: {bot.get('id')}")
            print(f"✅ Bot Name: {bot.get('first_name')}")
            print(f"✅ Bot Username: @{bot.get('username')}")
        else:
            print(f"❌ Error: {result}")

async def test_webhook_info():
    """Test getting webhook info directly from Telegram API"""
    print("\n" + "=" * 60)
    print("TEST: Webhook Info (Direct Telegram API)")
    print("=" * 60)

    if not BOT_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN not configured")
        return

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        result = response.json()

        if result.get("ok"):
            info = result.get("result", {})
            print(f"Webhook URL: {info.get('url', 'Not set')}")
            print(f"Pending updates: {info.get('pending_update_count', 0)}")
            print(f"Last error: {info.get('last_error_message', 'None')}")
        else:
            print(f"❌ Error: {result}")

async def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("🧪 TELEGRAM BOT TESTS")
    print("=" * 60)

    await test_bot_info()
    await test_webhook_info()
    await test_telegram_setup()

    # Optional: test send message
    test_send = input("\n¿Quieres probar el envío de mensajes? (s/n): ")
    if test_send.lower() == 's':
        await test_send_message()

    print("\n" + "=" * 60)
    print("✅ TESTS COMPLETADOS")
    print("=" * 60)
    print("\nPróximos pasos:")
    print("1. Busca tu bot en Telegram (@username)")
    print("2. Envía /start")
    print("3. Prueba enviando mensajes")
    print("4. Prueba subiendo un documento PDF o DOCX")

if __name__ == "__main__":
    asyncio.run(main())
