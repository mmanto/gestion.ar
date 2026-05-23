#!/bin/bash

# Script para configurar webhook de Telegram
# ===========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          CONFIGURAR WEBHOOK DE TELEGRAM                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Cargar variables de entorno
source /home/mmanto/Projects/LeadTrackers/backend/.env

# Verificar que exista el token
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}❌ Error: TELEGRAM_BOT_TOKEN no está configurado en .env${NC}"
    exit 1
fi

echo -e "${BLUE}[1/4]${NC} Obteniendo información del túnel..."
echo ""

# Verificar si existe archivo .tunnel_info
if [ -f .tunnel_info ]; then
    source .tunnel_info
    echo -e "${GREEN}✅ Túnel encontrado:${NC}"
    echo -e "   URL: ${YELLOW}${TUNNEL_URL}${NC}"
    WEBHOOK_URL_TELEGRAM="${TUNNEL_URL}/api/webhook/telegram"
else
    echo -e "${RED}❌ No hay túnel activo${NC}"
    echo ""
    echo "Primero necesitas iniciar el túnel:"
    echo -e "${YELLOW}./start_tunnel.sh${NC}"
    echo ""
    exit 1
fi

echo ""
echo -e "${BLUE}[2/4]${NC} Información del bot de Telegram..."
echo ""

# Obtener información del bot
BOT_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
BOT_NAME=$(echo "$BOT_INFO" | grep -o '"first_name":"[^"]*"' | cut -d'"' -f4)

if [ -z "$BOT_USERNAME" ]; then
    echo -e "${RED}❌ Error: Token de Telegram inválido${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Bot encontrado:${NC}"
echo -e "   Nombre: ${YELLOW}${BOT_NAME}${NC}"
echo -e "   Username: ${YELLOW}@${BOT_USERNAME}${NC}"
echo -e "   Link: ${YELLOW}https://t.me/${BOT_USERNAME}${NC}"

echo ""
echo -e "${BLUE}[3/4]${NC} Configurando webhook..."
echo ""

# Configurar webhook
WEBHOOK_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL_TELEGRAM}\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"max_connections\": 100,
    \"allowed_updates\": [\"message\", \"edited_message\"]
  }")

SUCCESS=$(echo "$WEBHOOK_RESPONSE" | grep -o '"ok":true')

if [ -n "$SUCCESS" ]; then
    echo -e "${GREEN}✅ Webhook configurado correctamente${NC}"
else
    echo -e "${RED}❌ Error al configurar webhook${NC}"
    echo "Respuesta: $WEBHOOK_RESPONSE"
    exit 1
fi

echo ""
echo -e "${BLUE}[4/4]${NC} Verificando configuración..."
echo ""

# Verificar webhook
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")
WEBHOOK_URL_SET=$(echo "$WEBHOOK_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

echo -e "${GREEN}✅ Estado del webhook:${NC}"
echo "$WEBHOOK_INFO" | python3 -m json.tool 2>/dev/null || echo "$WEBHOOK_INFO"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ CONFIGURACIÓN COMPLETA                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🤖 Para usar el bot:${NC}"
echo -e "   1. Abre Telegram"
echo -e "   2. Busca: ${YELLOW}@${BOT_USERNAME}${NC}"
echo -e "   3. O usa este link: ${YELLOW}https://t.me/${BOT_USERNAME}${NC}"
echo -e "   4. Haz clic en ${YELLOW}START${NC}"
echo -e "   5. Envía un mensaje de prueba"
echo ""
echo -e "${BLUE}📊 Ver logs:${NC}"
echo -e "   ${YELLOW}docker logs -f leadtrackers_app${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo -e "   - El webhook está configurado para: ${YELLOW}${WEBHOOK_URL_TELEGRAM}${NC}"
echo -e "   - Si reinicias el túnel, debes ejecutar este script de nuevo"
echo -e "   - El túnel de localhost.run cambia de URL cada vez"
echo ""
