# RUNBOOK.md — Procedimientos de respuesta a incidentes

---

## El backend no responde

```bash
# 1. Ver estado de contenedores
docker compose ps

# 2. Ver logs recientes
docker compose logs --tail=50 backend

# 3. Reiniciar backend
docker compose restart backend

# 4. Verificar health
curl http://localhost:8000/api/health
```

---

## El bot no responde mensajes de WhatsApp

1. Verificar que el contenedor backend esté corriendo: `docker compose ps`
2. Verificar que el webhook esté activo en Meta for Developers
3. Verificar que la URL del webhook sea accesible desde internet: `curl https://tudominio.com/api/health`
4. Revisar logs del backend: `docker compose logs -f backend`
5. Verificar que el canal tenga status `active` en la base de datos

---

## Error OOM (Out of Memory) en el backend

Causa probable: el modelo de embeddings de `sentence-transformers` requiere ~1.8 GB de RAM.

```bash
# Ver uso de memoria
docker stats

# Si el servidor tiene solo 2 GB RAM, desactivar RAG:
# En la config del bot, setear use_rag: false
# O externalizar MongoDB y Redis a servicios cloud (ver INFRASTRUCTURE.md)
```

---

## La knowledge base RAG está vacía o corrupta

```bash
# Ver estadísticas de RAG
curl http://localhost:8000/api/rag/stats

# Si está corrupta, limpiar y re-indexar
curl -X DELETE http://localhost:8000/api/rag/clear

# Re-indexar documentos (subir via API o dashboard)
```

---

## MongoDB no arranca

```bash
# Ver logs de MongoDB
docker compose logs mongo

# Verificar espacio en disco
df -h

# Reiniciar MongoDB
docker compose restart mongo
```

---

## SSL / Certificado vencido

Traefik renueva automáticamente via ACME Let's Encrypt. Si falla:

```bash
# Ver logs de Traefik
docker compose logs traefik

# El archivo acme.json tiene las fechas de los certificados
cat /letsencrypt/acme.json | python3 -m json.tool | grep -A2 "notAfter"
```

---

## El login con Google/Microsoft en la app mobile vuelve al login / "No se pudo confirmar el login"

Síntoma: el usuario autoriza en Google, el tab se cierra y la app muestra un
error y vuelve al login. El flujo mobile depende de que **Nango entregue el
webhook de auth** al backend (`POST /api/tenant/oauth/webhook/nango`); sin él,
`/tenant/oauth/connect/login/status` queda `pending` para siempre.

Diagnóstico:

```bash
# ¿El backend recibe el webhook? (debe aparecer "recibi evento type=auth…")
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 backend | grep tenant_oauth_webhook
```

- Si **no aparece nada** → Nango no está mandando el webhook. Revisar en el
  dashboard de Nango (Environment Settings del environment del backend) que
  la **Webhook URL** sea
  `https://api.intellify.pro/api/tenant/oauth/webhook/nango` y que el evento
  **auth** esté activado. Con `primary_url` vacío Nango no envía ningún
  webhook (ver `docs/dev/SETUP.md` → "Configurar el webhook de Nango").
- Si aparece `no hay login pendiente para endUserId=…` → el webhook llega pero
  el `end_user.id` no coincide con una sesión (nonce expirado o evento fuera
  del flujo de login).
- Si aparece `login completado para nonce=…` pero la app aún falla → el
  problema es el polling/red del lado de la app, no el servidor.

---

## Push Notifications no llegan

1. Verificar que `VAPID_PRIVATE_KEY` y `VAPID_PUBLIC_KEY` estén configuradas en `.env.prod`
2. Verificar que el frontend tenga el service worker registrado
3. Revisar logs del backend al enviar: `docker compose logs -f backend | grep -i push`
4. Verificar en el navegador del cliente que los permisos de notificaciones estén habilitados

---

## Limpieza de disco

```bash
# Ver uso de disco
df -h
docker system df

# Limpiar imágenes y contenedores no usados
docker system prune -f

# Limpiar logs de Docker (si crecen mucho)
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```
