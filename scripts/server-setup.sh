#!/usr/bin/env bash
# server-setup.sh — Setup inicial del servidor de producción (correr una sola vez)
#
# Uso:
#   scp scripts/server-setup.sh user@servidor:/tmp/
#   ssh user@servidor "bash /tmp/server-setup.sh"
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/leadtrackers}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:-registry.gitlab.com/NAMESPACE/PROJECT}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}▶ Instalando Docker...${NC}"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "$USER"
fi

echo -e "${GREEN}▶ Creando directorio de despliegue: $DEPLOY_PATH${NC}"
mkdir -p "$DEPLOY_PATH/docs"

echo -e "${GREEN}▶ Copiando archivos de configuración...${NC}"
# Copiar desde el repo local (ajustar si usás git clone en su lugar)
# git clone https://gitlab.com/NAMESPACE/PROJECT.git "$DEPLOY_PATH"

cat > "$DEPLOY_PATH/.env" << EOF
REGISTRY_IMAGE=$REGISTRY_IMAGE
EOF

echo -e "${YELLOW}
══════════════════════════════════════════════════
  Pasos manuales restantes:
  1. Copiá docker-compose.yml y docker-compose.prod.yml al servidor:
       scp docker-compose.yml docker-compose.prod.yml $USER@HOST:$DEPLOY_PATH/

  2. Creá backend/.env.prod en el servidor con tus credenciales reales:
       mkdir -p $DEPLOY_PATH/backend
       nano $DEPLOY_PATH/backend/.env.prod

  3. En GitLab → Settings → CI/CD → Variables, agregá:
       SSH_PRIVATE_KEY   (Type: File)  → tu clave privada SSH
       DEPLOY_HOST       → IP o dominio del servidor
       DEPLOY_USER       → usuario SSH
       DEPLOY_PATH       → $DEPLOY_PATH

  4. El próximo push a main desplegará automáticamente.
══════════════════════════════════════════════════
${NC}"
