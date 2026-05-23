#!/bin/bash
# Script de inicialización de la base de conocimiento
# Crea documentos de ejemplo para el chatbot

set -e

echo "=================================================="
echo "Inicializando Base de Conocimiento RAG"
echo "=================================================="

# Crear directorio de documentos si no existe
mkdir -p docs

# Crear documento de ejemplo
cat > docs/info_negocio.txt << 'EOF'
INFORMACIÓN DEL NEGOCIO

Horarios de Atención:
Lunes a Viernes: 9:00 AM - 6:00 PM
Sábados: 10:00 AM - 2:00 PM
Domingos: Cerrado

Ubicación:
Av. Corrientes 1234, CABA, Argentina
Tel: +54 11 1234-5678
Email: info@empresa.com

Servicios:
- Consultoría en tecnología
- Desarrollo de software a medida
- Soporte técnico 24/7
- Cloud computing y DevOps
- Inteligencia Artificial y Machine Learning

Precios:
- Consulta inicial: Gratis (1 hora)
- Hora de desarrollo: $50 USD
- Mantenimiento mensual: desde $200 USD
- Proyectos completos: Presupuesto a medida

Política de Devoluciones:
30 días de garantía en todos nuestros servicios.
Si no estás satisfecho, te devolvemos el 100% de tu dinero.

Formas de Pago:
- Transferencia bancaria
- MercadoPago
- PayPal
- Criptomonedas (BTC, ETH, USDT)

Proceso de Contratación:
1. Contacto inicial (gratis)
2. Análisis de requerimientos
3. Propuesta y presupuesto
4. Firma de contrato
5. Desarrollo
6. Entrega y capacitación
7. Soporte post-venta

Clientes Destacados:
- Empresa A - Desarrollo de e-commerce
- Empresa B - Automatización de procesos
- Empresa C - Chatbot con IA

Certificaciones:
- AWS Certified Solutions Architect
- Google Cloud Professional
- Scrum Master Certified
EOF

echo "✅ Documento de ejemplo creado: docs/info_negocio.txt"

# Esperar a que la API esté lista
echo ""
echo "Esperando a que la API esté disponible..."
until curl -s http://localhost:8000/api/health > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo ""
echo "✅ API está lista"

# Upload documento usando la API
echo ""
echo "Cargando documento a la base de conocimiento..."
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@docs/info_negocio.txt" \
  -F "title=Información del Negocio" \
  -F "category=empresa" \
  -s | python3 -m json.tool || echo "⚠️  Instala python3 para ver el JSON formateado"

echo ""
echo "=================================================="
echo "✅ Base de conocimiento inicializada correctamente"
echo "=================================================="
echo ""
echo "Puedes probar con:"
echo "curl -X POST http://localhost:8000/api/rag/search \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"query\": \"¿Cuál es el horario?\"}'"
echo ""
