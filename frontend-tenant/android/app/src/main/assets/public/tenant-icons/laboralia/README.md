Colocar acá los íconos de la app para el tenant `laboralia`:

- `favicon.ico`
- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `apple-touch-icon.png` (180x180)

`docker-entrypoint.sh` los copia sobre `/favicon.ico` e `/icons/*` al arrancar
el contenedor cuando `TENANT_SLUG=laboralia`. Hasta que estos archivos
existan, el contenedor sirve el favicon genérico de `public/`.
