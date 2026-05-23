#!/bin/bash

# Script para instalar ngrok en Arch Linux
# =========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     INSTALACIÓN DE NGROK              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Verificar si ngrok ya está instalado
if command -v ngrok &> /dev/null; then
    echo -e "${GREEN}✅ ngrok ya está instalado${NC}"
    ngrok version
    exit 0
fi

echo -e "${YELLOW}📥 Descargando ngrok...${NC}"
echo ""

# Crear directorio temporal
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Descargar ngrok
echo "Descargando desde ngrok.com..."
wget -q --show-progress https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error descargando ngrok${NC}"
    exit 1
fi

# Extraer
echo ""
echo -e "${YELLOW}📦 Extrayendo archivo...${NC}"
tar xzf ngrok-v3-stable-linux-amd64.tgz

# Mover a /usr/local/bin
echo -e "${YELLOW}📂 Instalando en /usr/local/bin...${NC}"
sudo mv ngrok /usr/local/bin/

# Limpiar
cd -
rm -rf "$TEMP_DIR"

# Verificar instalación
if command -v ngrok &> /dev/null; then
    echo ""
    echo -e "${GREEN}✅ ngrok instalado correctamente${NC}"
    ngrok version
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     SIGUIENTE PASO                    ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo "1. Crea una cuenta en https://ngrok.com/"
    echo "2. Obtén tu authtoken desde el dashboard"
    echo "3. Configura el authtoken:"
    echo ""
    echo -e "${YELLOW}   ngrok config add-authtoken TU_AUTHTOKEN_AQUI${NC}"
    echo ""
    echo "4. Ejecuta:"
    echo -e "${YELLOW}   ./start_ngrok.sh${NC}"
    echo ""
else
    echo -e "${RED}❌ Error en la instalación${NC}"
    exit 1
fi
