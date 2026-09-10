FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html chat-widget.js robots.txt sitemap.xml /usr/share/nginx/html/
COPY landing/ /usr/share/nginx/html/landing/

# Páginas generadas por scripts/generate_pachoteayuda_pages.py: una por norma
# del HCD de Bolívar (/normas/) y la guía de trámites (/tramites/). Hay que
# correr el generador ANTES del build; si falta, este COPY falla con "no such
# file or directory" (ver docs/ops/DEPLOYMENT.md).
COPY normas/ /usr/share/nginx/html/normas/
COPY tramites/ /usr/share/nginx/html/tramites/

EXPOSE 80
