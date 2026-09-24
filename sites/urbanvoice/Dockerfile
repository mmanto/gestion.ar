FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Landing estática de una sola página: el CSS y los avatares SVG van inline en
# el propio index.html, así que el único asset externo es images/ (referenciado
# de forma relativa: images/logo.png, images/hero.png…).
COPY index.html /usr/share/nginx/html/
COPY images/    /usr/share/nginx/html/images/

EXPOSE 80
