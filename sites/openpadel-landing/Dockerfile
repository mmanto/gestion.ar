FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf


# Copiar todos los archivos estáticos de la landing
COPY index.html        /usr/share/nginx/html/
COPY chat-widget.js    /usr/share/nginx/html/
COPY design-system.css /usr/share/nginx/html/
COPY padel.mp4         /usr/share/nginx/html/
COPY uploads/          /usr/share/nginx/html/uploads/
COPY web/              /usr/share/nginx/html/web/

EXPOSE 80
