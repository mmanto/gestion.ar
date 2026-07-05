"""
User Service - Gestión de usuarios en PostgreSQL (ver ADR-006 en docs/dev/DECISIONS.md)
"""

from typing import Optional

from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth_service import get_password_hash, verify_password, User
from app.db.database import AsyncSessionLocal
from app.db.models import User as UserModel


class UserInDB(BaseModel):
    """Usuario almacenado en la base de datos"""
    username: str
    email: Optional[str] = None
    hashed_password: str
    disabled: bool = False


def _to_user_in_db(row: UserModel) -> UserInDB:
    return UserInDB(
        username=row.username,
        email=row.email,
        hashed_password=row.hashed_password,
        disabled=row.disabled,
    )


class UserService:
    """Servicio para gestionar usuarios en PostgreSQL"""

    async def ensure_indexes(self):
        """No-op: los índices ya se crean vía migraciones Alembic (ver backend/alembic/versions/)."""
        pass

    async def ensure_google_indexes(self):
        """No-op: ídem ensure_indexes."""
        pass

    async def get_user_by_username(self, username: str) -> Optional[UserInDB]:
        """Obtener usuario por username"""
        async with AsyncSessionLocal() as session:
            row = await session.get(UserModel, username)
            return _to_user_in_db(row) if row else None

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
        async with AsyncSessionLocal() as session:
            session.add(UserModel(
                username=username,
                email=email,
                hashed_password=hashed,
                disabled=False,
            ))
            await session.commit()

        return UserInDB(username=username, email=email, hashed_password=hashed, disabled=False)

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

    # ── ConnectionStorage (devbout-oauth / Nango) ──────────────────────────────
    # Nango custodia los tokens; sólo guardamos el mapeo (provider, connection_id,
    # email conectado), nunca un refresh token.

    async def get_connection(self, username: str) -> Optional[tuple[str, str, str]]:
        async with AsyncSessionLocal() as session:
            row = await session.get(UserModel, username)
        if not row or not row.nango_connection_id or not row.auth_provider:
            return None
        return (row.auth_provider, row.nango_connection_id, row.gmail_sender_email or "")

    async def save_connection(
        self, username: str, provider: str, connection_id: str, email: str
    ) -> None:
        async with AsyncSessionLocal() as session:
            row = await session.get(UserModel, username)
            if row:
                row.auth_provider = provider
                row.nango_connection_id = connection_id
                row.gmail_sender_email = email or None
                await session.commit()

    async def clear_connection(self, username: str) -> None:
        # Quita sólo la conexión de email; conserva la identidad de login
        # (provider_user_id / google_id) para no romper el ingreso del usuario.
        async with AsyncSessionLocal() as session:
            row = await session.get(UserModel, username)
            if row:
                row.nango_connection_id = None
                row.gmail_sender_email = None
                await session.commit()

    async def find_or_create_by_identity(
        self, provider: str, provider_user_id: str, email: str, given_name: str, family_name: str
    ) -> tuple[str, str]:
        import re
        import secrets
        from app.auth_service import create_access_token

        async with AsyncSessionLocal() as session:
            # 1. Find by (provider, provider_user_id)
            result = await session.execute(
                select(UserModel).where(
                    UserModel.auth_provider == provider,
                    UserModel.provider_user_id == provider_user_id,
                )
            )
            row = result.scalars().first()

            # 2. Legacy fallback: usuarios Google por google_id
            if not row and provider == "google":
                result = await session.execute(
                    select(UserModel).where(UserModel.google_id == provider_user_id)
                )
                row = result.scalars().first()

            # 3. Fall back to email
            if not row and email:
                result = await session.execute(select(UserModel).where(UserModel.email == email))
                row = result.scalars().first()

            if row:
                row.auth_provider = provider
                row.provider_user_id = provider_user_id
                if provider == "google" and not row.google_id:
                    row.google_id = provider_user_id
                await session.commit()
                username = row.username
            else:
                # Nuevo usuario (password aleatorio — debe ingresar vía proveedor social)
                local = email.split("@")[0]
                base = re.sub(r"[^a-zA-Z0-9_]", "_", local)
                username = base
                counter = 1
                while (await session.get(UserModel, username)) is not None:
                    username = f"{base}{counter}"
                    counter += 1
                session.add(UserModel(
                    username=username,
                    email=email,
                    hashed_password=get_password_hash(secrets.token_hex(32)),
                    disabled=False,
                    auth_provider=provider,
                    provider_user_id=provider_user_id,
                    google_id=provider_user_id if provider == "google" else None,
                ))
                await session.commit()

        token = create_access_token({"sub": username})
        return username, token

    async def ensure_default_admin(self):
        """
        Crear usuario admin por defecto si no existe ningún usuario.
        Preserva el acceso inicial con admin/admin123.
        """
        async with AsyncSessionLocal() as session:
            count = (await session.execute(select(func.count()).select_from(UserModel))).scalar_one()

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
