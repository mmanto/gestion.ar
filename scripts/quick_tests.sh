#!/bin/bash

# Quick tests for WhatsApp Bot
# =============================
# Conjunto de comandos rápidos para probar el bot

BASE_URL="http://localhost:8000"

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_menu() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   PRUEBAS RÁPIDAS - WHATSAPP BOT      ║${NC}"
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo ""
    echo "1) Health Check"
    echo "2) Verificar Webhook"
    echo "3) Probar Chat con Claude (sin RAG)"
    echo "4) Probar Chat con Claude + RAG"
    echo "5) Ver Rate Limit"
    echo "6) Ver Estadísticas de Conversaciones"
    echo "7) Ver Estadísticas de RAG"
    echo "8) 🚨 Enviar Mensaje Real a WhatsApp"
    echo "9) Simular Mensaje Entrante"
    echo "0) Salir"
    echo ""
}

health_check() {
    echo -e "${BLUE}[Health Check]${NC}"
    curl -s ${BASE_URL}/api/health | python3 -m json.tool
}

verify_webhook() {
    echo -e "${BLUE}[Webhook Verification]${NC}"
    curl -s "${BASE_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=ABRACADABRA&hub.challenge=test123"
    echo ""
}

test_chat() {
    echo -e "${BLUE}[Chat con Claude - Sin RAG]${NC}"
    echo "Mensaje: Hola Claude, cuéntame un dato curioso sobre la inteligencia artificial"
    echo ""
    curl -s -X POST ${BASE_URL}/api/chat \
        -H "Content-Type: application/json" \
        -d '{"message": "Hola Claude, cuéntame un dato curioso sobre la inteligencia artificial", "use_rag": false}' \
        | python3 -m json.tool
}

test_chat_rag() {
    echo -e "${BLUE}[Chat con Claude + RAG]${NC}"
    echo -e "${YELLOW}Nota: Asegúrate de tener documentos en la base de conocimiento${NC}"
    echo ""
    read -p "Ingresa tu pregunta: " question
    curl -s -X POST ${BASE_URL}/api/chat \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$question\", \"use_rag\": true}" \
        | python3 -m json.tool
}

check_rate_limit() {
    echo -e "${BLUE}[Rate Limit Check]${NC}"
    read -p "Ingresa el número de teléfono (ej: 5491234567890): " phone
    curl -s ${BASE_URL}/api/whatsapp/rate-limit/${phone} | python3 -m json.tool
}

conversation_stats() {
    echo -e "${BLUE}[Estadísticas de Conversaciones]${NC}"
    curl -s ${BASE_URL}/api/conversations/stats | python3 -m json.tool
}

rag_stats() {
    echo -e "${BLUE}[Estadísticas de RAG]${NC}"
    curl -s ${BASE_URL}/api/rag/stats | python3 -m json.tool
}

send_whatsapp_message() {
    echo -e "${BLUE}[Enviar Mensaje a WhatsApp]${NC}"
    echo -e "${YELLOW}⚠️  ADVERTENCIA: Esto enviará un mensaje REAL${NC}"
    echo ""
    read -p "Número destino (ej: 5491234567890): " phone
    read -p "Mensaje: " message

    echo ""
    echo "Confirmación:"
    echo "  Destino: $phone"
    echo "  Mensaje: $message"
    read -p "¿Continuar? (s/n): " confirm

    if [ "$confirm" == "s" ]; then
        curl -s -X POST ${BASE_URL}/api/whatsapp/send \
            -H "Content-Type: application/json" \
            -d "{\"to_number\": \"$phone\", \"message\": \"$message\"}" \
            | python3 -m json.tool
    else
        echo "Cancelado"
    fi
}

simulate_incoming() {
    echo -e "${BLUE}[Simular Mensaje Entrante]${NC}"
    read -p "Número remitente (ej: 5491234567890): " phone
    read -p "Mensaje: " message

    timestamp=$(date +%s)
    message_id="wamid.test_${timestamp}"

    curl -s -X POST ${BASE_URL}/api/webhook \
        -H "Content-Type: application/json" \
        -d "{
            \"object\": \"whatsapp_business_account\",
            \"entry\": [{
                \"id\": \"WHATSAPP_BUSINESS_ACCOUNT_ID\",
                \"changes\": [{
                    \"value\": {
                        \"messaging_product\": \"whatsapp\",
                        \"metadata\": {
                            \"display_phone_number\": \"15551234567\",
                            \"phone_number_id\": \"820406601151491\"
                        },
                        \"contacts\": [{
                            \"profile\": {
                                \"name\": \"Test User\"
                            },
                            \"wa_id\": \"$phone\"
                        }],
                        \"messages\": [{
                            \"from\": \"$phone\",
                            \"id\": \"$message_id\",
                            \"timestamp\": \"$timestamp\",
                            \"text\": {
                                \"body\": \"$message\"
                            },
                            \"type\": \"text\"
                        }]
                    },
                    \"field\": \"messages\"
                }]
            }]
        }" \
        | python3 -m json.tool
}

# Main loop
while true; do
    show_menu
    read -p "Selecciona una opción: " choice
    echo ""

    case $choice in
        1) health_check ;;
        2) verify_webhook ;;
        3) test_chat ;;
        4) test_chat_rag ;;
        5) check_rate_limit ;;
        6) conversation_stats ;;
        7) rag_stats ;;
        8) send_whatsapp_message ;;
        9) simulate_incoming ;;
        0) echo "¡Adiós!"; exit 0 ;;
        *) echo "Opción inválida" ;;
    esac

    echo ""
    read -p "Presiona Enter para continuar..."
done
