# ⚡ Configuración Rápida del Webhook

## 🎯 Opción 1: localhost.run (MÁS FÁCIL - Sin instalación)

### Paso 1: Iniciar el túnel
```bash
./start_localhostrun.sh
```

Verás algo como:
```
Connect to http://abc123.lhr.life or https://abc123.lhr.life
```

**Copia esa URL** (la que empieza con https)

### Paso 2: Configurar en Meta
1. Ve a https://developers.facebook.com/
2. Tu app > WhatsApp > Configuration
3. Webhook > Edit
4. Pega:
   - **Callback URL**: `https://abc123.lhr.life/api/webhook`
   - **Verify Token**: `ABRACADABRA`
5. Verify and Save
6. Suscribirse a: `messages`

### Paso 3: Probar
Envía un mensaje a tu número de WhatsApp Business. ¡El bot debería responder!

---

## 🎯 Opción 2: ngrok (Más profesional)

### Instalación rápida:
```bash
./install_ngrok.sh
```

### Obtener authtoken:
1. Regístrate en https://ngrok.com/
2. Copia tu authtoken desde el dashboard
3. Ejecuta:
```bash
ngrok config add-authtoken TU_AUTHTOKEN
```

### Iniciar:
```bash
./start_ngrok.sh
```

El script te dará la URL y las instrucciones para Meta.

---

## 🐛 Solución de Problemas

### El webhook no verifica
```bash
# Verificar que el servidor esté corriendo
curl http://localhost:8000/api/health

# Si no responde, iniciar servicios
docker-compose up -d
```

### La URL no funciona
```bash
# Probar la URL pública directamente
curl https://TU-URL-PUBLICA/api/health

# Debería devolver: {"status": "healthy", ...}
```

### Ver qué está pasando
```bash
# Logs del bot
docker logs -f whatsapp_rag_app

# Dashboard de ngrok (si usas ngrok)
# Abre en navegador: http://localhost:4040
```

---

## 📱 ¿Funciona?

Sabrás que funciona cuando:
1. ✅ Meta verifica el webhook (mensaje verde en la configuración)
2. ✅ Envías mensaje a WhatsApp → Bot responde
3. ✅ Ves logs en `docker logs -f whatsapp_rag_app`

---

## 💡 Tip

**localhost.run** es perfecto para empezar, pero:
- La URL cambia cada vez que reinicias
- Tienes que actualizar en Meta cada vez

**ngrok** es mejor porque:
- Puedes pagar por URL permanente
- Tiene dashboard para ver tráfico
- Más estable

Para producción, usa un servidor real (VPS, Cloud Run, Railway, etc.)
