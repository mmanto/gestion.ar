#!/usr/bin/env python3
"""
Script de pruebas avanzado para WhatsApp Integration
Incluye pruebas de envío de mensajes y simulación de webhooks
"""

import requests
import json
import time
from typing import Dict, Any

BASE_URL = "http://localhost:8000"
TEST_PHONE = "5491234567890"  # Cambia esto a tu número de prueba


class WhatsAppTester:
    """Clase para ejecutar pruebas de WhatsApp"""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()

    def print_test_header(self, test_name: str):
        """Imprime encabezado de prueba"""
        print(f"\n{'='*60}")
        print(f"🧪 {test_name}")
        print('='*60)

    def print_result(self, success: bool, message: str):
        """Imprime resultado de prueba"""
        icon = "✅" if success else "❌"
        print(f"{icon} {message}")

    def test_health(self) -> bool:
        """Test 1: Health Check"""
        self.print_test_header("TEST 1: Health Check")

        try:
            response = self.session.get(f"{self.base_url}/api/health")
            data = response.json()

            print(json.dumps(data, indent=2))

            if data.get("status") == "healthy":
                self.print_result(True, "API está funcionando correctamente")
                return True
            else:
                self.print_result(False, "API no responde correctamente")
                return False

        except Exception as e:
            self.print_result(False, f"Error: {str(e)}")
            return False

    def test_webhook_verification(self) -> bool:
        """Test 2: Verificación de Webhook"""
        self.print_test_header("TEST 2: Verificación de Webhook")

        try:
            # Test con token correcto
            params = {
                "hub.mode": "subscribe",
                "hub.verify_token": "ABRACADABRA",
                "hub.challenge": "test_challenge_12345"
            }

            response = self.session.get(f"{self.base_url}/api/webhook", params=params)

            if response.status_code == 200 and response.text == "test_challenge_12345":
                self.print_result(True, "Webhook verification exitosa")
                print(f"   Challenge recibido: {response.text}")
                return True
            else:
                self.print_result(False, f"Webhook verification falló: {response.text}")
                return False

        except Exception as e:
            self.print_result(False, f"Error: {str(e)}")
            return False

    def test_webhook_security(self) -> bool:
        """Test 3: Seguridad del Webhook"""
        self.print_test_header("TEST 3: Seguridad del Webhook")

        try:
            # Test con token incorrecto
            params = {
                "hub.mode": "subscribe",
                "hub.verify_token": "WRONG_TOKEN",
                "hub.challenge": "test_challenge"
            }

            response = self.session.get(f"{self.base_url}/api/webhook", params=params)

            if response.status_code == 403:
                self.print_result(True, "Seguridad funcionando - rechaza tokens incorrectos")
                return True
            else:
                self.print_result(False, f"Problema de seguridad - código: {response.status_code}")
                return False

        except Exception as e:
            self.print_result(False, f"Error: {str(e)}")
            return False

    def test_rate_limit(self, phone: str) -> bool:
        """Test 4: Rate Limit"""
        self.print_test_header("TEST 4: Rate Limit Check")

        try:
            response = self.session.get(f"{self.base_url}/api/whatsapp/rate-limit/{phone}")
            data = response.json()

            print(json.dumps(data, indent=2))

            if data.get("success"):
                rate_limit = data.get("rate_limit", {})
                can_send = not rate_limit.get("exceeded", True)

                if can_send:
                    self.print_result(True, f"Se pueden enviar mensajes ({rate_limit.get('remaining')}/{rate_limit.get('limit')} restantes)")
                else:
                    self.print_result(False, "Rate limit excedido")

                return True
            else:
                self.print_result(False, "Error obteniendo información de rate limit")
                return False

        except Exception as e:
            self.print_result(False, f"Error: {str(e)}")
            return False

    def test_send_message(self, phone: str, message: str, dry_run: bool = True) -> bool:
        """Test 5: Envío de Mensaje"""
        self.print_test_header("TEST 5: Envío de Mensaje a WhatsApp")

        if dry_run:
            print("⚠️  MODO DRY RUN - No se enviará mensaje real")
            print(f"   Número destino: {phone}")
            print(f"   Mensaje: {message}")
            print("\n   Para enviar mensaje real, ejecuta:")
            print(f"   python3 test_whatsapp.py --send-message '{phone}' '{message}'")
            return True

        try:
            print(f"📤 Enviando mensaje a {phone}...")

            payload = {
                "to_number": phone,
                "message": message,
                "preview_url": False
            }

            response = self.session.post(
                f"{self.base_url}/api/whatsapp/send",
                json=payload,
                headers={"Content-Type": "application/json"}
            )

            data = response.json()
            print(json.dumps(data, indent=2))

            if response.status_code == 200 and data.get("success"):
                self.print_result(True, "Mensaje enviado exitosamente")
                print(f"   Message ID: {data.get('message_id', 'N/A')}")
                return True
            else:
                self.print_result(False, f"Error enviando mensaje: {data.get('detail', 'Unknown error')}")
                return False

        except Exception as e:
            self.print_result(False, f"Error: {str(e)}")
            return False

    def test_simulate_incoming_message(self, from_phone: str, message: str) -> bool:
        """Test 6: Simular Mensaje Entrante (sin firma)"""
        self.print_test_header("TEST 6: Simular Mensaje Entrante")

        print("⚠️  Esta prueba simula un mensaje entrante de WhatsApp")
        print("   Nota: La verificación de firma está deshabilitada en desarrollo")

        try:
            # Crear payload simulado de WhatsApp
            webhook_payload = {
                "object": "whatsapp_business_account",
                "entry": [{
                    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
                    "changes": [{
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15551234567",
                                "phone_number_id": "820406601151491"
                            },
                            "contacts": [{
                                "profile": {
                                    "name": "Test User"
                                },
                                "wa_id": from_phone
                            }],
                            "messages": [{
                                "from": from_phone,
                                "id": f"wamid.test_{int(time.time())}",
                                "timestamp": str(int(time.time())),
                                "text": {
                                    "body": message
                                },
                                "type": "text"
                            }]
                        },
                        "field": "messages"
                    }]
                }]
            }

            print(f"\n📥 Simulando mensaje de {from_phone}: '{message}'")

            response = self.session.post(
                f"{self.base_url}/api/webhook",
                json=webhook_payload,
                headers={"Content-Type": "application/json"}
            )

            data = response.json()
            print(json.dumps(data, indent=2))

            if response.status_code == 200:
                self.print_result(True, "Webhook procesado correctamente")
                return True
            else:
                self.print_result(False, f"Error procesando webhook: {response.status_code}")
                return False

        except Exception as e:
            self.print_result(False, f"Error: {str(e)}")
            return False

    def run_all_tests(self, send_real_message: bool = False):
        """Ejecutar todas las pruebas"""
        print("\n" + "="*60)
        print("🚀 INICIANDO SUITE DE PRUEBAS DE WHATSAPP")
        print("="*60)

        results = []

        # Ejecutar todas las pruebas
        results.append(("Health Check", self.test_health()))
        results.append(("Webhook Verification", self.test_webhook_verification()))
        results.append(("Webhook Security", self.test_webhook_security()))
        results.append(("Rate Limit", self.test_rate_limit(TEST_PHONE)))
        results.append(("Send Message", self.test_send_message(
            TEST_PHONE,
            "🧪 Mensaje de prueba del bot RAG con Claude",
            dry_run=not send_real_message
        )))

        # Resumen
        print("\n" + "="*60)
        print("📊 RESUMEN DE PRUEBAS")
        print("="*60)

        passed = sum(1 for _, result in results if result)
        total = len(results)

        for test_name, result in results:
            icon = "✅" if result else "❌"
            print(f"{icon} {test_name}")

        print("\n" + "="*60)
        print(f"Resultado: {passed}/{total} pruebas pasaron")
        print("="*60)

        return passed == total


if __name__ == "__main__":
    import sys

    tester = WhatsAppTester(BASE_URL)

    if len(sys.argv) > 1 and sys.argv[1] == "--send-message":
        # Modo envío de mensaje real
        if len(sys.argv) >= 4:
            phone = sys.argv[2]
            message = sys.argv[3]
            tester.test_send_message(phone, message, dry_run=False)
        else:
            print("Uso: python3 test_whatsapp.py --send-message <phone> <message>")
    elif len(sys.argv) > 1 and sys.argv[1] == "--simulate-incoming":
        # Modo simulación de mensaje entrante
        if len(sys.argv) >= 4:
            phone = sys.argv[2]
            message = sys.argv[3]
            tester.test_simulate_incoming_message(phone, message)
        else:
            print("Uso: python3 test_whatsapp.py --simulate-incoming <phone> <message>")
    else:
        # Modo suite completa
        tester.run_all_tests(send_real_message=False)
