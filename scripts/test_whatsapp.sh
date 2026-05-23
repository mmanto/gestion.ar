#!/bin/bash

# Script de pruebas para WhatsApp Integration
# ========================================

BASE_URL="http://localhost:8000"
PHONE_NUMBER="5491234567890"  # Cambia esto por tu número de prueba (formato: código país + número)
VERIFY_TOKEN="ABRACADABRA"

echo "================================================"
echo "🧪 PRUEBAS DE WHATSAPP INTEGRATION"
echo "================================================"
echo ""

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${BLUE}[TEST 1]${NC} Health Check del API"
echo "-------------------------------------------"
RESPONSE=$(curl -s ${BASE_URL}/api/health)
echo "$RESPONSE" | python3 -m json.tool
STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'error'))")

if [ "$STATUS" == "healthy" ]; then
    echo -e "${GREEN}✅ API está funcionando${NC}"
else
    echo -e "${RED}❌ API no responde correctamente${NC}"
    exit 1
fi
echo ""

# Test 2: Webhook Verification
echo -e "${BLUE}[TEST 2]${NC} Verificación de Webhook (GET /api/webhook)"
echo "-------------------------------------------"
echo "Simulando llamada de verificación de WhatsApp..."
CHALLENGE="test_challenge_123"
WEBHOOK_URL="${BASE_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}"

RESPONSE=$(curl -s "$WEBHOOK_URL")
echo "Response: $RESPONSE"

if [ "$RESPONSE" == "$CHALLENGE" ]; then
    echo -e "${GREEN}✅ Webhook verification exitosa${NC}"
    echo "   El servidor respondió correctamente con el challenge"
else
    echo -e "${RED}❌ Webhook verification falló${NC}"
    echo "   Esperado: $CHALLENGE"
    echo "   Recibido: $RESPONSE"
fi
echo ""

# Test 3: Webhook Verification con token incorrecto
echo -e "${BLUE}[TEST 3]${NC} Verificación de Webhook con token incorrecto"
echo "-------------------------------------------"
WEBHOOK_URL="${BASE_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=${CHALLENGE}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WEBHOOK_URL")
echo "HTTP Code: $HTTP_CODE"

if [ "$HTTP_CODE" == "403" ]; then
    echo -e "${GREEN}✅ Seguridad del webhook funcionando correctamente${NC}"
    echo "   El servidor rechaza tokens incorrectos (403 Forbidden)"
else
    echo -e "${RED}❌ Seguridad del webhook tiene problemas${NC}"
    echo "   Esperado: 403, Recibido: $HTTP_CODE"
fi
echo ""

# Test 4: Rate Limit Check
echo -e "${BLUE}[TEST 4]${NC} Verificación de Rate Limit"
echo "-------------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/whatsapp/rate-limit/${PHONE_NUMBER}")
echo "$RESPONSE" | python3 -m json.tool

CAN_SEND=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('can_send_message', False))" 2>/dev/null)

if [ "$CAN_SEND" == "True" ]; then
    echo -e "${GREEN}✅ Rate limit OK - Se pueden enviar mensajes${NC}"
else
    echo -e "${RED}⚠️  Rate limit alcanzado o error${NC}"
fi
echo ""

# Test 5: Envío de mensaje de prueba (comentado por defecto)
echo -e "${BLUE}[TEST 5]${NC} Envío de mensaje de prueba"
echo "-------------------------------------------"
echo -e "${RED}⚠️  ADVERTENCIA: Esta prueba enviará un mensaje real a WhatsApp${NC}"
echo "Para ejecutarla, descomenta la sección en el script"
echo ""
echo "Comando de ejemplo:"
echo "curl -X POST ${BASE_URL}/api/whatsapp/send \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"to_number\": \"${PHONE_NUMBER}\", \"message\": \"🧪 Mensaje de prueba del bot\"}'"
echo ""

# Descomenta las siguientes líneas para enviar mensaje real:
# echo "Enviando mensaje de prueba a ${PHONE_NUMBER}..."
# RESPONSE=$(curl -s -X POST ${BASE_URL}/api/whatsapp/send \
#   -H "Content-Type: application/json" \
#   -d "{\"to_number\": \"${PHONE_NUMBER}\", \"message\": \"🧪 Mensaje de prueba del bot RAG con Claude\"}")
# echo "$RESPONSE" | python3 -m json.tool
#
# SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
#
# if [ "$SUCCESS" == "True" ]; then
#     echo -e "${GREEN}✅ Mensaje enviado exitosamente${NC}"
# else
#     echo -e "${RED}❌ Error enviando mensaje${NC}"
# fi

echo ""
echo "================================================"
echo "✅ PRUEBAS COMPLETADAS"
echo "================================================"
echo ""
echo "Siguiente paso:"
echo "1. Para enviar un mensaje de prueba real, edita este script"
echo "2. Cambia PHONE_NUMBER a tu número de WhatsApp (con código de país)"
echo "3. Descomenta la sección de TEST 5"
echo ""
