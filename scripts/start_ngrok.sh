#!/bin/bash

# Script para iniciar ngrok apuntando al frontend (puerto 3000).
# Nginx se encarga de rutear internamente:
#   /api/  → backend:8000
#   /ws/   → backend:8000
#   /      → React app
# ============================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        INICIANDO NGROK                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Verificar ngrok instalado
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}❌ ngrok no está instalado${NC}"
    echo "Ejecuta primero: ./install_ngrok.sh"
    exit 1
fi

# Verificar servicios
echo -e "${BLUE}[1/4]${NC} Verificando servicios locales..."

if ! curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend no está corriendo en puerto 8000${NC}"
    echo "Inicia los servicios: docker compose up -d"
    exit 1
fi
echo -e "   ${GREEN}✅ Backend (8000)${NC}"

if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${RED}❌ Frontend no está corriendo en puerto 5173${NC}"
    echo "Inicia el frontend: cd frontend && npm run dev"
    exit 1
fi
echo -e "   ${GREEN}✅ Frontend (5173)${NC}"
echo ""

# Matar ngrok anterior
killall ngrok 2>/dev/null
sleep 1

# Iniciar ngrok en puerto 5173 (Vite proxea /api/ y /ws/ al backend)
echo -e "${BLUE}[2/4]${NC} Iniciando ngrok en puerto 5173..."
nohup ngrok http 5173 > /tmp/ngrok_start.log 2>&1 &
NGROK_PID=$!
sleep 4

if ! ps -p $NGROK_PID > /dev/null; then
    echo -e "${RED}❌ Error iniciando ngrok${NC}"
    cat /tmp/ngrok_start.log 2>/dev/null
    echo ""
    echo "Si no tenés authtoken: ngrok config add-authtoken TU_TOKEN"
    exit 1
fi
echo -e "   ${GREEN}✅ ngrok iniciado (PID: $NGROK_PID)${NC}"
echo ""

# Obtener URL pública
echo -e "${BLUE}[3/4]${NC} Obteniendo URL pública..."
sleep 2

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
data = json.load(sys.stdin)
tunnels = data.get('tunnels', [])
for t in tunnels:
    if t.get('proto') == 'https':
        print(t['public_url'])
        break
if not tunnels:
    # fallback al primero
    print(tunnels[0]['public_url'] if tunnels else '')
" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
    echo -e "${RED}❌ No se pudo obtener la URL${NC}"
    echo "Abre http://localhost:4040 para verla manualmente"
    kill $NGROK_PID 2>/dev/null
    exit 1
fi
echo -e "   ${GREEN}✅ URL obtenida${NC}"
echo ""

# Verificar webhook
echo -e "${BLUE}[4/4]${NC} Verificando webhook de WhatsApp..."
RESPONSE=$(curl -s "${NGROK_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=ABRACADABRA&hub.challenge=test123")
if [ "$RESPONSE" == "test123" ]; then
    echo -e "   ${GREEN}✅ Webhook OK${NC}"
else
    echo -e "   ${YELLOW}⚠️  Respuesta: $RESPONSE${NC}"
fi
echo ""

# ── Resumen ────────────────────────────────────────────────────────────────────
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    URL PÚBLICA                                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🌐 URL:${NC}"
echo -e "   ${YELLOW}${NGROK_URL}${NC}"
echo ""
echo -e "${GREEN}📊 Dashboard ngrok:${NC}"
echo -e "   ${YELLOW}http://localhost:4040${NC}"
echo ""

# ── QR web ─────────────────────────────────────────────────────────────────────
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  CANAL WEB (QR)                               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  1. Abre el panel → Bots → Canales"
echo "  2. Clic en 'Ver QR' del canal Web"
echo "  3. Pega esta URL en el campo 'URL base':"
echo ""
echo -e "     ${YELLOW}${NGROK_URL}${NC}"
echo ""
echo "  4. Clic en 'Regenerar' y escanea"
echo ""

# ── WhatsApp/Telegram webhook ──────────────────────────────────────────────────
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              WEBHOOK WHATSAPP / TELEGRAM                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Callback URL:${NC}   ${YELLOW}${NGROK_URL}/api/webhook${NC}"
echo -e "${GREEN}Verify Token:${NC}   ${YELLOW}ABRACADABRA${NC}"
echo ""
echo -e "${YELLOW}⚠️  La URL cambia cada vez que reinicias ngrok (plan gratuito)${NC}"
echo ""

# Guardar info
cat > .ngrok_info << EOF
NGROK_PID=$NGROK_PID
NGROK_URL=$NGROK_URL
WEBHOOK_URL=${NGROK_URL}/api/webhook
STARTED_AT=$(date)
EOF

echo -e "${GREEN}✅ Info guardada en .ngrok_info${NC}"

# Actualizar WEBHOOK_BASE_URL en backend/.env y reiniciar backend
for envfile in backend/.env backend/.env.dev; do
    if [ -f "$envfile" ]; then
        if grep -q "^WEBHOOK_BASE_URL=" "$envfile"; then
            sed -i "s|^WEBHOOK_BASE_URL=.*|WEBHOOK_BASE_URL=${NGROK_URL}|" "$envfile"
        else
            echo "WEBHOOK_BASE_URL=${NGROK_URL}" >> "$envfile"
        fi
        echo -e "${GREEN}✅ ${envfile} actualizado (WEBHOOK_BASE_URL=${NGROK_URL})${NC}"
    fi
done

if docker compose ps app 2>/dev/null | grep -q "Up"; then
    echo -e "${BLUE}   Reiniciando backend para aplicar nueva URL...${NC}"
    docker compose restart app
    echo -e "${GREEN}✅ Backend reiniciado${NC}"
fi
echo ""
echo "Presiona Ctrl+C para detener"
echo ""

trap "echo ''; echo 'Deteniendo ngrok...'; kill $NGROK_PID 2>/dev/null; rm -f .ngrok_info; echo -e '${GREEN}✅ Detenido${NC}'; exit 0" INT

tail -f /dev/null & wait
