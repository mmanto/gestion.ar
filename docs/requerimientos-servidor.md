# Requerimientos Mínimos de Servidor — VentaChat

## El factor dominante: el stack de ML (RAG)

La biblioteca `sentence-transformers` arrastra `torch` (PyTorch) como dependencia, lo que hace que la imagen del backend pese **~3.5–4 GB** y consuma **~1.5–2 GB de RAM** solo por tener el modelo de embeddings cargado en memoria.

---

## Consumo de RAM por servicio

| Servicio | RAM en runtime |
|----------|---------------|
| MongoDB 7 (WiredTiger cache 256 MB) | ~512 MB |
| Redis 7 Alpine (maxmemory 128 MB) | ~150 MB |
| FastAPI + torch + sentence-transformers + chromadb | ~1.8–2.5 GB |
| Nginx + frontend compilado | ~50–80 MB |
| OS + Docker daemon | ~400–600 MB |
| **Total** | **~3.0–3.9 GB** |

> **RAM mínima absoluta: 4 GB.** Con 2 GB el proceso Python muere por OOM en la primera consulta RAG.

---

## CPU

| Escenario | vCPU mínimo | Latencia RAG esperada |
|-----------|------------|----------------------|
| 1–5 usuarios/día | 2 vCPU | 3–8 seg/query |
| 5–30 usuarios/día | 4 vCPU | 3–6 seg/query |
| 30+ concurrentes | 8 vCPU o GPU | Requiere rediseño |

> La inferencia del modelo de embeddings es CPU-bound. Con 2 vCPU funciona pero lento bajo carga.

---

## Disco

| Dato | Tamaño |
|------|--------|
| Docker images (4 contenedores) | ~5–6 GB |
| OS + herramientas | ~8–10 GB |
| `mongo_data` (conversaciones, clientes) | ~100 MB inicial, crece lento |
| `chroma_data` (vectores embeddings) | ~50 MB inicial, crece con documentos |
| `./docs` (PDFs/DOCX subidos) | Variable |
| **Total mínimo** | **~20–25 GB usados → pedir 40 GB+** |

---

## Red (obligatorio para funcionar)

| Requisito | Necesario para |
|-----------|---------------|
| IP pública estática | Telegram/WhatsApp webhooks |
| Dominio con DNS apuntando al servidor | SSL + webhooks |
| HTTPS (SSL/TLS) | Telegram lo exige; VAPID push también |
| Puertos 80 y 443 abiertos | Nginx |

> Let's Encrypt + Certbot = SSL gratis. Sin dominio+SSL no funcionan Telegram ni las push notifications.

---

## Especificaciones recomendadas

### Mínimo viable (hasta ~10 usuarios/día)
```
RAM:    4 GB
vCPU:   2 cores
Disco:  40 GB SSD
OS:     Ubuntu 22.04 LTS
Extras: Docker, Docker Compose v2, dominio + SSL
```

### Producción real (hasta ~50 usuarios/día)
```
RAM:    8 GB
vCPU:   4 cores
Disco:  80 GB SSD
```

---

## Opciones de VPS por precio/calidad

| Proveedor | Plan | RAM | vCPU | Disco | Precio/mes |
|-----------|------|-----|------|-------|-----------|
| **Hetzner** (mejor opción EU) | CX31 | 8 GB | 2 vCPU | 80 GB | ~€8.29 |
| **Hetzner** | CPX31 | 8 GB | 4 vCPU | 160 GB | ~€16.90 |
| **Contabo** | Cloud VPS S | 8 GB | 4 vCPU | 200 GB | ~$8.99 |
| DigitalOcean | Basic 4 GB | 4 GB | 2 vCPU | 80 GB | ~$24 |
| Vultr | Cloud 4 GB | 4 GB | 2 vCPU | 80 GB | ~$24 |

> **Hetzner CX31 (~€8/mes)** es la opción más eficiente para comenzar. Los proveedores americanos son ~3x más caros por las mismas specs.

---

## Estrategia lean: bajar a 2 GB RAM (~$6–12/mes)

Si se externalizan los servicios pesados:

| Componente a externalizar | Opción gratuita | RAM liberada |
|--------------------------|----------------|-------------|
| MongoDB | **MongoDB Atlas M0** (512 MB gratis) | ~512 MB |
| Redis | **Redis Cloud 30 MB** (gratis) | ~150 MB |
| RAG desactivado (`use_rag: false` en bots) | — | ~1.8 GB |

Con esta configuración el backend consume ~300–400 MB → un VPS de 2 GB es suficiente para el bot base con Claude (sin RAG).

---

## Resumen ejecutivo

| Caso de uso | RAM | vCPU | Disco | Costo estimado |
|-------------|-----|------|-------|---------------|
| RAG habilitado, self-hosted | **4 GB mín / 8 GB rec** | 2–4 | 40–80 GB | €8–17/mes (Hetzner) |
| Sin RAG + DBs en cloud (lean) | **2 GB** | 1–2 | 20 GB | ~$6–12/mes |

---

## Checklist de deployment

- [ ] Servidor Ubuntu 22.04 LTS con IP pública estática
- [ ] Docker Engine + Docker Compose v2 instalados
- [ ] Dominio con registro A apuntando a la IP del servidor
- [ ] SSL con Certbot: `certbot --nginx -d tudominio.com`
- [ ] Firewall: puertos 22 (SSH), 80 y 443 abiertos únicamente
- [ ] Archivo `.env` con todas las variables configuradas:
  - `ANTHROPIC_API_KEY`
  - `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- [ ] `docker compose up -d --build` (primera vez tarda ~10 min por el build del backend)
- [ ] Registrar webhook de Telegram:
  ```
  POST https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://tudominio.com/api/telegram/webhook
  ```
