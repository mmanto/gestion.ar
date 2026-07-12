"""
Upload Router - Sube archivos de imagen (avatares de usuario) y los deja
servidos vía StaticFiles (ver mount en app/main.py). Cualquier usuario
autenticado puede usarlo — el username no forma parte del path guardado, así
que subir un archivo no toca directamente el registro de ningún usuario;
quien llama es responsable de guardar la URL devuelta donde corresponda
(self-service PATCH /api/auth/me, o alta/edición vía /api/admin/users o
/api/tenant/users).
"""

import os
import uuid as _uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth_service import User
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOADS_DIR = "/app/uploads"
AVATARS_DIR = os.path.join(UPLOADS_DIR, "avatars")

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2MB


@router.post("/avatar", response_model=dict)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Sube una imagen de avatar y devuelve su URL pública (relativa, servida
    a través del mismo proxy /api que usa el resto de la app)."""
    ext = ALLOWED_CONTENT_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Formato no soportado — usá JPG, PNG, WEBP o GIF",
        )

    contents = await file.read()
    if len(contents) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La imagen supera el tamaño máximo de 2MB",
        )

    os.makedirs(AVATARS_DIR, exist_ok=True)
    filename = f"{_uuid.uuid4().hex}{ext}"
    file_path = os.path.join(AVATARS_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(contents)

    return {"success": True, "url": f"/api/uploads/avatars/{filename}"}
