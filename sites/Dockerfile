# Imagen única para TODAS las landings (antes un contenedor por sitio). Cada
# sitio se copia completo a /usr/share/nginx/html/<slug>/ (estructura relativa
# intacta: assets, uploads/, web/, normas/, tramites/, residuos/, imágenes,
# videos). nginx elige la raíz por Host (map $http_host $landing_root, ver
# nginx.conf). Alta de una landing nueva = copiar el directorio del sitio acá
# + una línea al map + un label Traefik (no un contenedor).
#
# El paso previo de scripts/generate_pachoteayuda_pages.py se mantiene: las
# páginas /normas/, /tramites/ y /residuos/ no se versionan, así que el COPY
# de abajo falla a propósito si no se corrieron (mejor build roto que sitio
# publicado a medias).
FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY ius-landing/ /usr/share/nginx/html/ius/
COPY laboralia-landing/ /usr/share/nginx/html/laboralia/
COPY proptech-landing/ /usr/share/nginx/html/proptech/
COPY erma/ /usr/share/nginx/html/erma/
COPY pachoteayuda-landing/ /usr/share/nginx/html/pachoteayuda/
COPY openpadel-landing/ /usr/share/nginx/html/openpadel/
COPY urbanvoice/ /usr/share/nginx/html/urbanvoice/

EXPOSE 80
