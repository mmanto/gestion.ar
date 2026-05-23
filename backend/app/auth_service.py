"""
Servicio de autenticación JWT para VentaChat
Maneja login, creación y verificación de tokens JWT
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel
import os

# Configuración JWT
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 horas por defecto

# ==================== MODELOS ====================

class User(BaseModel):
    """Modelo de usuario"""
    username: str
    email: Optional[str] = None
    disabled: Optional[bool] = False


class Token(BaseModel):
    """Token de acceso"""
    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Datos del token"""
    username: Optional[str] = None


# ==================== FUNCIONES DE PASSWORD ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verificar que el password en texto plano coincida con el hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """Generar hash de un password"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


# ==================== FUNCIONES DE JWT ====================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crear token JWT de acceso"""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """Verificar y decodear token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ==================== FUNCIONES ASYNC DE USUARIO ====================

async def authenticate_user(username: str, password: str) -> Optional[User]:
    """
    Autenticar usuario consultando MongoDB

    Args:
        username: Nombre de usuario
        password: Password en texto plano

    Returns:
        Usuario si las credenciales son correctas, None si no
    """
    from app.services.user_service import get_user_service
    user_service = get_user_service()
    return await user_service.authenticate_user(username, password)


async def get_current_user_from_token(token: str) -> Optional[User]:
    """
    Obtener usuario actual desde un token JWT, consultando MongoDB

    Args:
        token: Token JWT string

    Returns:
        Usuario si el token es válido, None si no
    """
    payload = verify_token(token)
    if payload is None:
        return None

    username: str = payload.get("sub")
    if username is None:
        return None

    from app.services.user_service import get_user_service
    user_service = get_user_service()
    user_in_db = await user_service.get_user_by_username(username)
    if user_in_db is None:
        return None

    return User(username=user_in_db.username, email=user_in_db.email, disabled=user_in_db.disabled)
