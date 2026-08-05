FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY *.html /usr/share/nginx/html/
COPY register-embed.js /usr/share/nginx/html/
COPY *.svg *.png *.jpg *.webp /usr/share/nginx/html/

EXPOSE 80
