#!/bin/bash

# Script para configurar Telegram con Cloudflare Tunnel
# ======================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          CONFIGURAR TELEGRAM CON CLOUDFLARE TUNNEL           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Cargar variables
source /home/mmanto/Projects/LeadTrackers/backend/.env

if [ ! -f /home/mmanto/Projects/LeadTrackers/.tunnel_cloudflare ]; then
    echo -e "${RED}❌ No se encontró túnel de Cloudflare${NC}"
    echo ""
    echo "Primero ejecuta:"
    echo -e "${YELLOW}./setup_cloudflare_tunnel.sh${NC}"
    exit 1
fi

source /home/mmanto/Projects/LeadTrackers/.tunnel_cloudflare

echo -e "${BLUE}[1/3]${NC} Túnel detectado:"
echo -e "   URL: ${YELLOW}${TUNNEL_URL}${NC}"
echo ""

echo -e "${BLUE}[2/3]${NC} Configurando webhook de Telegram..."
echo ""

# Configurar webhook
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL_TELEGRAM}\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"max_connections\": 100,
    \"allowed_updates\": [\"message\", \"edited_message\"]
  }")

SUCCESS=$(echo "$RESPONSE" | grep -o '"ok":true')

if [ -n "$SUCCESS" ]; then
    echo -e "${GREEN}✅ Webhook configurado${NC}"
else
    echo -e "${RED}❌ Error:${NC}"
    echo "$RESPONSE"
    exit 1
fi

echo ""
echo -e "${BLUE}[3/3]${NC} Obteniendo información del bot..."
echo ""

BOT_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)

echo -e "${GREEN}✅ Bot: ${YELLOW}@${BOT_USERNAME}${NC}"
echo -e "${GREEN}✅ Link: ${YELLOW}https://t.me/${BOT_USERNAME}${NC}"
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ TELEGRAM CONFIGURADO                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Prueba tu bot:"
echo "1. Abre: ${YELLOW}https://t.me/${BOT_USERNAME}${NC}"
echo "2. Haz clic en START"
echo "3. Envía un mensaje"
echo ""
