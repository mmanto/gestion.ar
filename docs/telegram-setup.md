# Configuración del Bot de Telegram

Esta guía te ayudará a configurar tu bot de Telegram paso a paso para que funcione con tu sistema de WhatsApp RAG.

---

## Paso 1: Crear Bot con @BotFather

1. **Abre Telegram** y busca **@BotFather** (es el bot oficial de Telegram para crear bots)

2. **Inicia conversación** con `/start`

3. **Crea un nuevo bot** con el comando `/newbot`

4. **Sigue las instrucciones:**
   - **Nombre del bot:** Elige un nombre amigable (ejemplo: "Mi Asistente RAG")
   - **Username del bot:** Debe terminar en "bot" (ejemplo: "mi_asistente_rag_bot")

5. **@BotFather te dará un token de acceso:**
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
   ```

6. **IMPORTANTE:** Guarda este token de forma segura. Lo necesitarás en el siguiente paso.

---

## Paso 2: Configurar Variables de Entorno

Edita el archivo `backend/.env` y agrega tus credenciales de Telegram:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
TELEGRAM_WEBHOOK_SECRET=tu_secreto_aleatorio_aqui_12345
```

### Generar un secreto aleatorio

Para mayor seguridad, genera un secreto aleatorio:

```bash
openssl rand -hex 32
```

O puedes usar cualquier string aleatorio largo (mínimo 20 caracteres).

---

## Paso 3: Iniciar tu Aplicación

Reinicia los contenedores de Docker para que tomen las nuevas variables de entorno:

```bash
docker-compose restart
```

Verifica que la aplicación esté corriendo:

```bash
curl http://localhost:8000/api/health
```

Deberías ver:
```json
{"status":"healthy","timestamp":"...","service":"whatsapp-rag-bot","version":"0.1.0"}
```

---

## Paso 4: Configurar Webhook

### Opción A: Desarrollo Local con ngrok

Si estás desarrollando localmente, necesitas exponer tu servidor a internet:

1. **Inicia ngrok:**
   ```bash
   ./ngrok http 8000
   ```

2. **Copia la URL HTTPS** que te da ngrok (ejemplo: `https://abc123.ngrok.io`)

3. **Configura el webhook** usando el script automatizado:
   ```bash
   python scripts/setup_telegram_webhook.py
   ```

4. **Ingresa tu URL** cuando te lo pida:
   ```
   https://abc123.ngrok.io/api/webhook/telegram
   ```

### Opción B: Producción (servidor con dominio)

Si ya tienes un servidor con dominio HTTPS:

```bash
curl -X POST "https://api.telegram.org/bot<TU_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-dominio.com/api/webhook/telegram",
    "secret_token": "tu_secreto_aleatorio_aqui_12345",
    "allowed_updates": ["message"]
  }'
```

**Reemplaza:**
- `<TU_BOT_TOKEN>` con el token que te dio @BotFather
- `tu-dominio.com` con tu dominio real
- `tu_secreto_aleatorio_aqui_12345` con el secreto que configuraste en `.env`

---

## Paso 5: Verificar Configuración

### Verificar mediante API

Consulta el endpoint de setup de tu aplicación:

```bash
curl http://localhost:8000/api/telegram/setup
```

Deberías ver información del bot y el estado del webhook.

### Verificar directamente con Telegram

Consulta el estado del webhook:

```bash
curl "https://api.telegram.org/bot<TU_BOT_TOKEN>/getWebhookInfo"
```

Deberías ver algo como:

```json
{
  "ok": true,
  "result": {
    "url": "https://abc123.ngrok.io/api/webhook/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40
  }
}
```

---

## Paso 6: Probar tu Bot

### 1. Buscar tu bot en Telegram

- Abre Telegram
- Busca el username de tu bot (ejemplo: @mi_asistente_rag_bot)
- Haz clic en el bot para abrir la conversación

### 2. Enviar `/start`

Envía el comando `/start` y deberías recibir el mensaje de bienvenida.

### 3. Probar funcionalidades

#### **Mensaje de texto:**
```
¿Qué es RAG?
```

El bot debería:
- Mostrar indicador de "escribiendo..."
- Responder usando Claude AI con contexto de tu base de conocimiento

#### **Subir documento:**
- Adjunta un archivo PDF o DOCX
- El bot lo procesará y agregará a la base RAG
- Verás mensajes de progreso y un resumen al final

#### **Comando /help:**
```
/help
```

Verás las instrucciones de uso.

#### **Comando /stats:**
```
/stats
```

Verás tus estadísticas de uso personales.

---

## Comandos Disponibles

- `/start` - Mensaje de bienvenida con descripción del bot
- `/help` - Instrucciones de uso y formatos soportados
- `/stats` - Ver tus estadísticas de uso (conversaciones, tokens, costos)

---

## Troubleshooting

### Error: "Webhook verification failed"

**Causa:** El secreto del webhook no coincide.

**Solución:**
1. Verifica que `TELEGRAM_WEBHOOK_SECRET` en `.env` coincida con el que enviaste en `setWebhook`
2. Reinicia los contenedores: `docker-compose restart`
3. Vuelve a configurar el webhook

### Error: "Bot not configured"

**Causa:** `TELEGRAM_BOT_TOKEN` no está configurado o es inválido.

**Solución:**
1. Verifica que el token en `.env` sea correcto
2. Prueba el token manualmente:
   ```bash
   curl "https://api.telegram.org/bot<TU_TOKEN>/getMe"
   ```
3. Si es inválido, crea un nuevo bot con @BotFather

### El bot no responde a mensajes

**Posibles causas:**

1. **Webhook no configurado:**
   ```bash
   curl "https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo"
   ```
   Si `url` está vacío, configura el webhook.

2. **Servidor no accesible:**
   - Si usas ngrok, verifica que esté corriendo
   - Prueba la URL manualmente: `curl https://tu-url/api/health`

3. **Logs del servidor:**
   ```bash
   docker-compose logs -f app
   ```
   Busca errores o excepciones.

### Error: "File too large"

**Causa:** El archivo que intentas subir es mayor a 20MB.

**Solución:**
- El límite es de 20MB por archivo
- Divide el documento en archivos más pequeños
- O comprime el PDF para reducir su tamaño

### Ngrok se desconecta

**Causa:** La conexión de ngrok se pierde.

**Solución:**
1. Reinicia ngrok: `./ngrok http 8000`
2. Copia la nueva URL
3. Reconfigura el webhook con la nueva URL:
   ```bash
   python scripts/setup_telegram_webhook.py
   ```

### Rate limit exceeded

**Causa:** Enviaste más de 10 mensajes en 1 minuto.

**Solución:**
- Espera 60 segundos
- Los rate limits se reinician automáticamente
- El bot te avisará cuando puedas enviar más mensajes

---

## Comandos Útiles

### Ver información del bot
```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/getMe"
```

### Ver información del webhook
```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo"
```

### Eliminar webhook (para usar polling en desarrollo)
```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/deleteWebhook"
```

### Ver logs en tiempo real
```bash
docker-compose logs -f app
```

### Ver logs solo de Telegram
```bash
docker-compose logs -f app | grep Telegram
```

### Reiniciar solo la aplicación
```bash
docker-compose restart app
```

---

## Arquitectura del Sistema

```
Usuario en Telegram
        ↓
Telegram Bot API
        ↓
Webhook: /api/webhook/telegram
        ↓
TelegramService (parse, validate)
        ↓
    ┌────────────────┐
    ├─ Comando → Handler de comandos
    ├─ Texto → RAG + Claude → Respuesta
    └─ Documento → Download → Process RAG → Confirmación
        ↓
ConversationService (MongoDB)
        ↓
Respuesta al usuario
```

---

## Recursos Adicionales

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#6-botfather)
- [Webhook Guide](https://core.telegram.org/bots/webhooks)
- [ngrok Documentation](https://ngrok.com/docs)

---

## Próximos Pasos

Una vez que tu bot esté funcionando:

1. **Agrega documentos a la base RAG**
   - Envía PDFs con información relevante
   - El bot usará estos documentos para responder preguntas

2. **Personaliza los comandos**
   - Edita `backend/app/main.py`
   - Modifica las respuestas de `/start`, `/help`, `/stats`

3. **Monitorea el uso**
   - Revisa logs: `docker-compose logs -f app`
   - Consulta estadísticas: `/stats` en Telegram
   - Consulta MongoDB para análisis avanzado

4. **Configura en producción**
   - Usa un dominio con HTTPS
   - Configura certificados SSL
   - Considera usar un webhook secret fuerte

---

## Soporte

Si tienes problemas:

1. Revisa los logs: `docker-compose logs -f app`
2. Verifica las variables de entorno en `.env`
3. Consulta esta documentación
4. Revisa el código en `backend/app/telegram_service.py` y `backend/app/main.py`

¡Disfruta tu bot de Telegram con RAG y Claude AI! 🤖
