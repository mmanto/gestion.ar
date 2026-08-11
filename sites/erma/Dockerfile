FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY chat-widget.js /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY img-*.jpg /usr/share/nginx/html/
COPY hero-video.mp4 /usr/share/nginx/html/

EXPOSE 80