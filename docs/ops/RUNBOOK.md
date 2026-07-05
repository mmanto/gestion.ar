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
