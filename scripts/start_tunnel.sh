#!/bin/bash

# Script para iniciar localhost.run y capturar la URL
# ====================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          INICIANDO TÚNEL PÚBLICO CON LOCALHOST.RUN           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verificar servidor local
echo -e "${BLUE}[1/4]${NC} Verificando servidor local..."
if ! curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo -e "${RED}❌ El servidor no está corriendo${NC}"
    echo ""
    echo "Inicia los servicios primero:"
    echo -e "${YELLOW}docker-compose up -d${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Servidor corriendo en http://localhost:8000${NC}"
echo ""

# Matar procesos SSH anteriores de localhost.run
echo -e "${BLUE}[2/4]${NC} Limpiando túneles anteriores..."
pkill -f "ssh.*localhost.run" 2>/dev/null
sleep 1
echo -e "${GREEN}✅ Listo${NC}"
echo ""

# Crear archivo temporal para capturar output
TEMP_LOG=$(mktemp)

echo -e "${BLUE}[3/4]${NC} Iniciando túnel SSH con localhost.run..."
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo "   - La primera vez puede pedir confirmar la fingerprint SSH"
echo "   - Si aparece, escribe 'yes' y presiona Enter"
echo "   - Puede tardar 5-10 segundos en conectar"
echo ""
echo -e "${BLUE}Conectando...${NC}"

# Iniciar SSH en background y capturar output
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:8000 localhost.run > "$TEMP_LOG" 2>&1 &
SSH_PID=$!

# Esperar a que aparezca la URL (máximo 30 segundos)
echo -n "Esperando URL"
for i in {1..30}; do
    sleep 1
    echo -n "."

    # Buscar la URL en el log
    if grep -q "tunneled with tls termination" "$TEMP_LOG" 2>/dev/null; then
        break
    fi

    # Verificar si el proceso sigue corriendo
    if ! ps -p $SSH_PID > /dev/null 2>&1; then
        echo ""
        echo -e "${RED}❌ Error: El túnel SSH falló${NC}"
        echo ""
        echo "Salida del comando:"
        cat "$TEMP_LOG"
        rm -f "$TEMP_LOG"
        exit 1
    fi
done
echo ""
echo ""

# Extraer la URL
sleep 2
TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.lhr\.life' "$TEMP_LOG" | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo -e "${YELLOW}⚠️  No se pudo detectar la URL automáticamente${NC}"
    echo ""
    echo "Output del túnel:"
    cat "$TEMP_LOG"
    echo ""
    echo -e "${YELLOW}Busca manualmente la URL que empieza con https://...lhr.life${NC}"
else
    echo -e "${BLUE}[4/4]${NC} Túnel establecido"
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    ✅ TÚNEL ACTIVO                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}🌐 URL Pública:${NC}"
    echo -e "   ${YELLOW}${TUNNEL_URL}${NC}"
    echo ""
    echo -e "${GREEN}🔗 Webhook URL:${NC}"
    echo -e "   ${YELLOW}${TUNNEL_URL}/api/webhook${NC}"
    echo ""

    # Guardar info
    cat > .tunnel_info << EOF
TUNNEL_TYPE=localhost.run
TUNNEL_PID=$SSH_PID
TUNNEL_URL=$TUNNEL_URL
WEBHOOK_URL=${TUNNEL_URL}/api/webhook
STARTED_AT=$(date)
EOF

    echo -e "${GREEN}✅ Información guardada en .tunnel_info${NC}"
fi

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              CONFIGURAR EN META FOR DEVELOPERS                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "1. Ve a: ${YELLOW}https://developers.facebook.com/${NC}"
echo "2. Selecciona tu aplicación WhatsApp Business"
echo "3. Ve a: ${YELLOW}WhatsApp > Configuration${NC}"
echo "4. En la sección ${YELLOW}Webhook${NC}, haz clic en ${YELLOW}Edit${NC}"
echo "5. Ingresa:"
echo ""
echo -e "   ${GREEN}Callback URL:${NC}"
if [ -n "$TUNNEL_URL" ]; then
    echo -e "   ${YELLOW}${TUNNEL_URL}/api/webhook${NC}"
else
    echo -e "   ${YELLOW}https://TU-URL.lhr.life/api/webhook${NC}"
fi
echo ""
echo -e "   ${GREEN}Verify Token:${NC}"
echo -e "   ${YELLOW}ABRACADABRA${NC}"
echo ""
echo "6. Haz clic en ${YELLOW}Verify and Save${NC}"
echo "7. Suscríbete a: ${YELLOW}messages${NC} ✅"
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      PROBAR EL BOT                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "1. Envía un mensaje de WhatsApp a tu número de negocio"
echo "2. El bot debería responder automáticamente con Claude"
echo "3. Monitorea los logs en otra terminal:"
echo -e "   ${YELLOW}docker logs -f leadtrackers_app${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo "   - Túnel corriendo con PID: ${YELLOW}$SSH_PID${NC}"
echo "   - Para detener: ${YELLOW}kill $SSH_PID${NC} o presiona Ctrl+C"
echo "   - Para ver estado: ${YELLOW}./webhook_status.sh${NC}"
echo "   - La URL de localhost.run cambia cada vez que reinicias"
echo ""

# Limpiar archivo temporal
rm -f "$TEMP_LOG"

echo -e "${GREEN}✅ ¡Listo! El túnel está activo.${NC}"
echo ""
echo -e "${BLUE}Presiona Ctrl+C para detener el túnel${NC}"
echo ""

# Mantener el proceso vivo
trap "echo ''; echo 'Deteniendo túnel...'; kill $SSH_PID 2>/dev/null; rm -f .tunnel_info; echo -e '${GREEN}✅ Túnel detenido${NC}'; exit 0" INT

# Esperar a que el usuario presione Ctrl+C
wait $SSH_PID
