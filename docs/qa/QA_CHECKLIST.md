# QA_CHECKLIST.md — Checklist de entrega

Verificar todos los ítems antes de hacer deploy a producción.

---

## Backend

- [ ] `docker compose exec backend pytest` pasa sin errores
- [ ] `GET /api/health` responde `{"status": "healthy"}`
- [ ] Login funciona: `POST /api/auth/login` devuelve token
- [ ] Endpoints protegidos rechazan requests sin JWT (401)
- [ ] CRUD de bots funciona correctamente
- [ ] CRUD de canales funciona correctamente
- [ ] RAG: subir un documento y verificar que aparece en `/api/rag/stats`
- [ ] RAG: hacer una búsqueda y obtener resultados relevantes
- [ ] Chat con RAG: `/api/chat` devuelve respuesta coherente

## Canales de mensajería

- [ ] WhatsApp: webhook verifica correctamente con Meta
- [ ] WhatsApp: mensaje enviado llega al bot y el bot responde
- [ ] Telegram: webhook registrado y bot responde mensajes
- [ ] Web chat: WebSocket conecta y mensajes fluyen en tiempo real

## Infraestructura

- [ ] Todos los contenedores están corriendo: `docker compose ps`
- [ ] No hay OOM (Out of Memory): `docker stats` muestra uso normal
- [ ] Disco con espacio suficiente: `df -h` > 2 GB libres
- [ ] SSL válido: `curl -I https://tudominio.com` responde 200

## Variables de entorno

- [ ] `ANTHROPIC_API_KEY` configurada y funcionando
- [ ] `SECRET_KEY` es un string aleatorio seguro (mínimo 32 chars)
- [ ] `VAPID_*` configuradas si se usa canal PWA
- [ ] `.env.prod` no está commiteado en Git

## Seguridad

- [ ] Archivo `.env.prod` está en `.gitignore`
- [ ] Ninguna credencial real en el código fuente
- [ ] Rate limiting activo en bots (`rate_limit_messages` configurado)
- [ ] Webhook secret de Telegram configurado y verificado

## Documentación

- [ ] `CHANGELOG.md` actualizado con los cambios del release
- [ ] Si se agregaron endpoints: `docs/dev/API.md` actualizado
- [ ] Si se cambiaron modelos: `docs/dev/DATA_MODEL.md` actualizado
- [ ] Si se cambiaron vars de entorno: `ENV.md` actualizado
