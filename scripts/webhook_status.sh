#!/bin/bash

# Script para verificar el estado del webhook
# ============================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ESTADO DEL WEBHOOK                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# 1. Verificar servidor local
echo -e "${BLUE}[1/5]${NC} Servidor Local"
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ Corriendo en http://localhost:8000${NC}"
else
    echo -e "   ${RED}❌ No está corriendo${NC}"
    echo -e "   ${YELLOW}Ejecuta: docker-compose up -d${NC}"
fi
echo ""

# 2. Verificar Docker
echo -e "${BLUE}[2/5]${NC} Contenedores Docker"
RUNNING=$(docker ps | grep leadtrackers_app | wc -l)
if [ "$RUNNING" -gt 0 ]; then
    echo -e "   ${GREEN}✅ Contenedor leadtrackers_app corriendo${NC}"
    docker ps | grep leadtrackers | awk '{print "   - "$NF" ("$7")"}'
else
    echo -e "   ${RED}❌ Contenedor no está corriendo${NC}"
fi
echo ""

# 3. Verificar ngrok
echo -e "${BLUE}[3/5]${NC} Túnel ngrok"
if [ -f .ngrok_info ]; then
    source .ngrok_info
    if ps -p $NGROK_PID > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ ngrok corriendo (PID: $NGROK_PID)${NC}"
        echo -e "   ${YELLOW}URL: $NGROK_URL${NC}"
        echo -e "   ${YELLOW}Webhook: $WEBHOOK_URL${NC}"
        echo -e "   Iniciado: $STARTED_AT"
    else
        echo -e "   ${RED}❌ ngrok no está corriendo${NC}"
        echo -e "   ${YELLOW}Ejecuta: ./start_ngrok.sh${NC}"
        rm -f .ngrok_info
    fi
else
    echo -e "   ${YELLOW}⚠️  No hay información de ngrok${NC}"
    echo -e "   ${YELLOW}Ejecuta: ./start_ngrok.sh${NC}"
fi
echo ""

# 4. Verificar webhook local
echo -e "${BLUE}[4/5]${NC} Webhook Local"
RESPONSE=$(curl -s "http://localhost:8000/api/webhook?hub.mode=subscribe&hub.verify_token=ABRACADABRA&hub.challenge=test123")
if [ "$RESPONSE" == "test123" ]; then
    echo -e "   ${GREEN}✅ Webhook respondiendo correctamente${NC}"
else
    echo -e "   ${RED}❌ Webhook no responde como esperado${NC}"
    echo -e "   Respuesta: $RESPONSE"
fi
echo ""

# 5. Verificar configuración
echo -e "${BLUE}[5/5]${NC} Configuración"
if docker exec leadtrackers_app env | grep -q "WEBHOOK_VERIFY_TOKEN=ABRACADABRA"; then
    echo -e "   ${GREEN}✅ Verify Token configurado${NC}"
else
    echo -e "   ${RED}❌ Verify Token no configurado correctamente${NC}"
fi

if docker exec leadtrackers_app env | grep -q "WHATSAPP_TOKEN="; then
    echo -e "   ${GREEN}✅ WhatsApp Token configurado${NC}"
else
    echo -e "   ${RED}❌ WhatsApp Token no configurado${NC}"
fi

if docker exec leadtrackers_app env | grep -q "ANTHROPIC_API_KEY="; then
    echo -e "   ${GREEN}✅ Claude API Key configurado${NC}"
else
    echo -e "   ${RED}❌ Claude API Key no configurado${NC}"
fi
echo ""

# Resumen
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ACCIONES RÁPIDAS                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "📊 Ver logs:          docker logs -f leadtrackers_app"
echo "🚀 Iniciar ngrok:     ./start_ngrok.sh"
echo "🌐 localhost.run:     ./start_localhostrun.sh"
echo "🧪 Pruebas:           ./test_whatsapp.sh"
echo "📖 Guía completa:     cat WEBHOOK_QUICKSTART.md"
echo ""
