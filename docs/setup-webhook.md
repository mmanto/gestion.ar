# 🌐 Configuración del Webhook Público para WhatsApp

## Opción 1: Usar ngrok (Recomendado para desarrollo)

### Paso 1: Instalar ngrok

**En Arch Linux:**
```bash
# Usando yay (AUR helper)
yay -S ngrok

# O descarga directamente desde ngrok.com
cd ~/Downloads
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/
```

### Paso 2: Crear cuenta en ngrok

1. Ve a https://ngrok.com/
2. Registra una cuenta gratuita
3. Obtén tu authtoken desde el dashboard

### Paso 3: Configurar authtoken

```bash
ngrok config add-authtoken TU_AUTHTOKEN_AQUI
```

### Paso 4: Exponer tu servidor local

```bash
# Exponer el puerto 8000 (donde corre tu API)
ngrok http 8000
```

Verás algo como:
```
Session Status                online
Account                       tu_email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       50ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://xxxx-xxx-xxx-xxx.ngrok-free.app -> http://localhost:8000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**IMPORTANTE:** Copia la URL de Forwarding (https://xxxx-xxx-xxx-xxx.ngrok-free.app)

---

## Opción 2: Usar localhost.run (Sin instalación)

```bash
ssh -R 80:localhost:8000 localhost.run
```

Te dará una URL pública como: `https://xxxxx.lhr.life`

---

## Opción 3: Usar Cloudflare Tunnel (Gratis, persistente)

### Instalación:
```bash
# Descargar cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Autenticar
cloudflared tunnel login

# Crear túnel
cloudflared tunnel create whatsapp-bot

# Exponer puerto
cloudflared tunnel --url http://localhost:8000
```

---

## Configurar Webhook en Meta for Developers

### Paso 1: Acceder a la configuración

1. Ve a https://developers.facebook.com/
2. Selecciona tu aplicación WhatsApp Business
3. En el menú lateral, ve a **WhatsApp > Configuration**

### Paso 2: Configurar el webhook

1. En la sección **Webhook**, haz clic en **Edit**
2. Ingresa la información:
   ```
   Callback URL: https://TU-URL-PUBLICA.ngrok-free.app/api/webhook
   Verify Token: ABRACADABRA
   ```

3. Haz clic en **Verify and Save**

**Nota importante para ngrok:**
- La URL gratuita de ngrok cambia cada vez que reinicias el túnel
- Necesitarás actualizar el webhook en Meta cada vez que reinicies ngrok
- Para una URL permanente, usa ngrok de pago o Cloudflare Tunnel

### Paso 3: Suscribirse a eventos

Después de verificar el webhook, suscríbete a los siguientes campos:
- ✅ `messages` (obligatorio)
- ⚙️ `message_status` (opcional, para ver estado de entrega)

---

## Script Automatizado de Configuración

He creado un script que te ayudará con el proceso:

```bash
./setup_webhook.sh
```

Este script:
1. Verifica si ngrok está instalado
2. Inicia ngrok automáticamente
3. Muestra la URL pública
4. Te da las instrucciones exactas para Meta
5. Realiza pruebas de verificación

---

## Verificar que el Webhook Funciona

### Prueba 1: Verificación manual

```bash
# Reemplaza TU-URL-PUBLICA con tu URL de ngrok
curl "https://TU-URL-PUBLICA.ngrok-free.app/api/webhook?hub.mode=subscribe&hub.verify_token=ABRACADABRA&hub.challenge=test123"
```

Debería responder: `test123`

### Prueba 2: Verificación desde Meta

Cuando configures el webhook en Meta, automáticamente hará esta verificación.

### Prueba 3: Enviar mensaje de prueba

1. Envía un mensaje a tu número de WhatsApp Business
2. El bot debería responder automáticamente
3. Verifica los logs:
```bash
docker logs -f whatsapp_rag_app
```

---

## Monitoreo en Tiempo Real

### Ver tráfico del webhook (con ngrok)

Abre en tu navegador:
```
http://localhost:4040
```

Aquí verás todas las peticiones HTTP que llegan a tu webhook.

### Ver logs del bot

```bash
docker logs -f whatsapp_rag_app
```

---

## Problemas Comunes

### Error: "Webhook verification failed"

**Causas:**
- El verify token no coincide
- El servidor no está respondiendo
- ngrok no está corriendo

**Solución:**
1. Verifica que ngrok esté corriendo: `curl https://TU-URL.ngrok-free.app/api/health`
2. Verifica el token en `.env`: `WEBHOOK_VERIFY_TOKEN=ABRACADABRA`
3. Reinicia los servicios: `docker-compose restart app`

### Error: "URL not reachable"

**Causas:**
- ngrok no está corriendo
- Firewall bloqueando la conexión
- El puerto 8000 no está accesible

**Solución:**
1. Verifica que el servidor local esté corriendo: `curl http://localhost:8000/api/health`
2. Reinicia ngrok
3. Verifica que Docker esté corriendo: `docker ps`

### Error: "Signature verification failed"

**Causas:**
- `WHATSAPP_APP_SECRET` incorrecto en `.env`
- Firma no coincide

**Solución:**
1. Verifica el App Secret en Meta for Developers
2. Actualiza `.env` con el valor correcto
3. Reinicia: `docker-compose restart app`

**Nota:** En desarrollo, la verificación de firma está deshabilitada si `WHATSAPP_APP_SECRET` no está configurado.

---

## Alternativas para Producción

Para producción, NO uses ngrok. Usa:

1. **Servidor dedicado** (DigitalOcean, AWS, etc.)
2. **Cloudflare Tunnel** (gratis, permanente)
3. **Google Cloud Run** (serverless, gratis hasta cierto uso)
4. **Heroku** (fácil despliegue con Docker)
5. **Railway.app** (gratis, fácil configuración)

---

## Siguiente Paso

Elige una opción (recomiendo ngrok para empezar) y ejecuta:

```bash
# Si usas ngrok (después de instalarlo)
./start_ngrok.sh

# O manualmente
ngrok http 8000
```

Luego avísame la URL que te dio y te ayudo con el resto de la configuración en Meta.
