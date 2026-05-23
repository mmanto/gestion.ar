#!/bin/bash

# Script para configurar Cloudflare Tunnel permanente
# ====================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          CONFIGURAR CLOUDFLARE TUNNEL (Permanente)           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verificar si cloudflared está instalado
if ! command -v cloudflared &> /dev/null; then
    echo -e "${BLUE}[1/5]${NC} Instalando Cloudflare Tunnel..."

    # Detectar arquitectura
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
    elif [ "$ARCH" = "aarch64" ]; then
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -O cloudflared
    else
        echo -e "${RED}❌ Arquitectura no soportada: $ARCH${NC}"
        exit 1
    fi

    chmod +x cloudflared
    sudo mv cloudflared /usr/local/bin/
    echo -e "${GREEN}✅ Cloudflared instalado${NC}"
else
    echo -e "${GREEN}✅ Cloudflared ya está instalado${NC}"
fi

echo ""
echo -e "${BLUE}[2/5]${NC} Autenticando con Cloudflare..."
echo ""
echo -e "${YELLOW}⚠️  Se abrirá un navegador para autenticarte${NC}"
echo "   - Inicia sesión con tu cuenta de Cloudflare (o crea una gratis)"
echo "   - Autoriza cloudflared"
echo "   - Vuelve a esta terminal"
echo ""
read -p "Presiona Enter cuando estés listo..."

cloudflared tunnel login

if [ ! -f ~/.cloudflared/cert.pem ]; then
    echo -e "${RED}❌ Error: No se pudo autenticar${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Autenticación exitosa${NC}"
echo ""

echo -e "${BLUE}[3/5]${NC} Creando túnel permanente..."
echo ""

TUNNEL_NAME="venta-chat-$(date +%s)"
TUNNEL_OUTPUT=$(cloudflared tunnel create $TUNNEL_NAME 2>&1)
TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)

if [ -z "$TUNNEL_ID" ]; then
    echo -e "${RED}❌ Error al crear túnel${NC}"
    echo "$TUNNEL_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✅ Túnel creado:${NC} ${YELLOW}$TUNNEL_ID${NC}"
echo ""

echo -e "${BLUE}[4/5]${NC} Configurando túnel..."
echo ""

# Crear archivo de configuración
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /home/$USER/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $TUNNEL_NAME.trycloudflare.com
    service: http://localhost:8000
  - service: http_status:404
EOF

echo -e "${GREEN}✅ Configuración creada${NC}"
echo ""

echo -e "${BLUE}[5/5]${NC} Configurando DNS y iniciando túnel..."
echo ""

# Configurar DNS
cloudflared tunnel route dns $TUNNEL_ID $TUNNEL_NAME.trycloudflare.com

# Crear servicio systemd para que inicie automáticamente
sudo tee /etc/systemd/system/cloudflared-venta-chat.service > /dev/null << EOF
[Unit]
Description=Cloudflare Tunnel para Venta Chat
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel --config /home/$USER/.cloudflared/config.yml run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# Habilitar y iniciar servicio
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-venta-chat
sudo systemctl start cloudflared-venta-chat

sleep 5

# Verificar estado
if systemctl is-active --quiet cloudflared-venta-chat; then
    echo -e "${GREEN}✅ Túnel iniciado correctamente${NC}"
else
    echo -e "${RED}❌ Error al iniciar túnel${NC}"
    sudo systemctl status cloudflared-venta-chat
    exit 1
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ TÚNEL PERMANENTE ACTIVO                 ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

TUNNEL_URL="https://$TUNNEL_NAME.trycloudflare.com"

echo -e "${GREEN}🌐 URL Permanente:${NC}"
echo -e "   ${YELLOW}${TUNNEL_URL}${NC}"
echo ""
echo -e "${GREEN}🔗 Webhook URLs:${NC}"
echo -e "   WhatsApp: ${YELLOW}${TUNNEL_URL}/api/webhook${NC}"
echo -e "   Telegram: ${YELLOW}${TUNNEL_URL}/api/webhook/telegram${NC}"
echo ""

# Guardar información
cat > /home/mmanto/Projects/LeadTrackers/.tunnel_cloudflare << EOF
TUNNEL_TYPE=cloudflare
TUNNEL_ID=$TUNNEL_ID
TUNNEL_NAME=$TUNNEL_NAME
TUNNEL_URL=$TUNNEL_URL
WEBHOOK_URL_WHATSAPP=${TUNNEL_URL}/api/webhook
WEBHOOK_URL_TELEGRAM=${TUNNEL_URL}/api/webhook/telegram
CREATED_AT=$(date)
EOF

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              CONFIGURAR WEBHOOKS                              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}WhatsApp:${NC}"
echo "1. Ve a: https://developers.facebook.com/"
echo "2. Tu app > WhatsApp > Configuration"
echo "3. Webhook URL: ${YELLOW}${TUNNEL_URL}/api/webhook${NC}"
echo "4. Verify Token: ${YELLOW}ABRACADABRA${NC}"
echo ""
echo -e "${YELLOW}Telegram:${NC}"
echo "Ejecuta: ${YELLOW}./setup_telegram_cloudflare.sh${NC}"
echo ""
echo -e "${GREEN}✅ Comandos útiles:${NC}"
echo "   Ver estado: ${YELLOW}sudo systemctl status cloudflared-venta-chat${NC}"
echo "   Ver logs: ${YELLOW}sudo journalctl -u cloudflared-venta-chat -f${NC}"
echo "   Reiniciar: ${YELLOW}sudo systemctl restart cloudflared-venta-chat${NC}"
echo "   Detener: ${YELLOW}sudo systemctl stop cloudflared-venta-chat${NC}"
echo ""
echo -e "${GREEN}⭐ Ventajas de Cloudflare Tunnel:${NC}"
echo "   ✅ URL permanente (no cambia)"
echo "   ✅ SSL automático"
echo "   ✅ Gratis para siempre"
echo "   ✅ Inicia automáticamente al reiniciar el servidor"
echo "   ✅ Alta disponibilidad"
echo ""
