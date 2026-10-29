# Wheels vendorizados (backend)

Wheels `cp313-linux-x86_64` que **no están en PyPI** para Python 3.13 y que
`pip` intentaría compilar desde el sdist (requiere `g++`/`meson`, que
`python:3.13-slim` no trae). El Dockerfile los instala **antes** de
`requirements.txt`:

| Wheel | Motivo |
|---|---|
| `numpy-1.26.4-cp313-cp313-linux_x86_64.whl` | `langchain==0.1.4` exige `numpy<2`; PyPI no publica cp313 para 1.26.4 |
| `chroma_hnswlib-0.7.3-cp313-cp313-linux_x86_64.whl` | `chromadb==0.4.22` fija `chroma-hnswlib==0.7.3`; sin wheel cp313 |

## Regenerar

En una imagen con toolchain (`python:3.13` completo o una con `build-essential`):

```bash
docker run --rm -v "$PWD/backend/vendor:/out" --entrypoint pip \
  python:3.13 wheel --no-deps --no-cache-dir numpy==1.26.4 chroma-hnswlib==0.7.3 -w /out
```

Los wheels son específicos de **linux x86_64**. En `aarch64` hay que
regenerarlos en esa arquitectura y actualizar los nombres; el Dockerfile
selecciona por glob. No se usan en runtime fuera del venv/site-packages.
