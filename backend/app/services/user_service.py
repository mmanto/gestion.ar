"""
User Service - Gestión de usuarios en MongoDB
"""

import os
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from app.auth_service import get_password_hash, verify_password, User


class UserInDB(BaseModel):
    """Usuario almacenado en MongoDB"""
    username: str
    email: Optional[str] = None
    hashed_password: str
    disabled: bool = False


class UserService:
    """Servicio para gestionar usuarios en MongoDB"""

    def __init__(self):
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/leadtrackers")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        self.users = self.db.users

    async def ensure_indexes(self):
        """Crear índices necesarios"""
        await self.users.create_index("username", unique=True)

    async def get_user_by_username(self, username: str) -> Optional[UserInDB]:
        """Obtener usuario por username"""
        doc = await self.users.find_one({"username": username}, {"_id": 0})
        if doc:
            return UserInDB(**doc)
        return None

    async def create_user(
        self,
        username: str,
        password: str,
        email: Optional[str] = None
    ) -> UserInDB:
        """
        Crear un nuevo usuario

        Args:
            username: Nombre de usuario único
            password: Contraseña en texto plano (se hashea internamente)
            email: Email opcional

        Returns:
            Usuario creado

        Raises:
            ValueError: Si el username ya existe
        """
        existing = await self.get_user_by_username(username)
        if existing:
            raise ValueError(f"El usuario '{username}' ya existe")

        hashed = get_password_hash(password)
        user_doc = {
            "username": username,
            "email": email,
            "hashed_password": hashed,
            "disabled": False,
        }
        await self.users.insert_one(user_doc)
        return UserInDB(**user_doc)

    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """
        Autenticar usuario con username y password

        Returns:
            User si las credenciales son correctas, None si no
        """
        user = await self.get_user_by_username(username)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        if user.disabled:
            return None
        return User(username=user.username, email=user.email, disabled=user.disabled)

    async def ensure_default_admin(self):
        """
        Crear usuario admin por defecto si no existe ningún usuario.
        Preserva el acceso inicial con admin/admin123.
        """
        count = await self.users.count_documents({})
        if count == 0:
            await self.create_user(
                username="admin",
                password="admin123",
                email="admin@ventachat.com"
            )
            print("✅ Usuario admin por defecto creado (admin/admin123)")
        else:
            # Verificar si admin específicamente existe
            admin = await self.get_user_by_username("admin")
            if not admin:
                print("ℹ️  Usuarios existentes en DB, no se crea admin por defecto")


# Instancia global del servicio
_user_service: Optional[UserService] = None


def get_user_service() -> UserService:
    """Obtiene la instancia del servicio de usuarios (singleton)"""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service
