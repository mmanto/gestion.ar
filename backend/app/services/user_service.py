"""
User Service - Gestión de usuarios en PostgreSQL (ver ADR-006 en docs/dev/DECISIONS.md)
"""

from typing import Dict, List, Optional

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth_service import get_password_hash, verify_password, User
from app.db.database import AsyncSessionLocal
from app.db.models import User as UserModel


class UserInDB(BaseModel):
    """Usuario almacenado en la base de datos"""
    username: str
    email: Optional[str] = None
    hashed_password: str
    disabled: bool = False
    tenant_id: Optional[str] = None
    role: str = "admin"


def _to_user_in_db(row: UserModel) -> UserInDB:
    return UserInDB(
        username=row.username,
        email=row.email,
        hashed_password=row.hashed_password,
        disabled=row.disabled,
        tenant_id=row.tenant_id,
        role=row.role,
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
        email: Optional[str] = None,
        tenant_id: Optional[str] = None,
        role: str = "admin",
    ) -> UserInDB:
        """
        Crear un nuevo usuario

        Args:
            username: Nombre de usuario único
            password: Contraseña en texto plano (se hashea internamente)
            email: Email opcional
            tenant_id: Tenant al que pertenece (None sólo para super_admin)
            role: 'super_admin' | 'admin' | 'operativo'

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
                tenant_id=tenant_id,
                role=role,
            ))
            await session.commit()

        return UserInDB(
            username=username, email=email, hashed_password=hashed, disabled=False,
            tenant_id=tenant_id, role=role,
        )

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
        return User(
            username=user.username,
            email=user.email,
            disabled=user.disabled,
            tenant_id=user.tenant_id,
            role=user.role,
        )

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
                tenant_id, role = row.tenant_id, row.role
            else:
                # No hay autoregistro: toda cuenta nueva la crea super_admin
                # desde administración general (ver estrategia multi-tenant).
                # Un identity social sin cuenta previa no tiene tenant al que
                # asociarse, así que no se crea un usuario "huérfano".
                raise ValueError(
                    "No existe una cuenta para este proveedor social. "
                    "Pedile a administración general que te cree un usuario."
                )

        token = create_access_token({"sub": username, "tenant_id": tenant_id, "role": role})
        return username, token

    async def ensure_default_admin(self):
        """
        Crear usuario admin por defecto si no existe ningún usuario.
        Preserva el acceso inicial con admin/admin123.
        """
        async with AsyncSessionLocal() as session:
            count = (await session.execute(select(func.count()).select_from(UserModel))).scalar_one()

        if count == 0:
            # En una instalación nueva, el primer usuario es el super_admin de
            # plataforma (administración general) — sin tenant propio. Los
            # tenants y sus usuarios se crean desde ahí, no por autoregistro.
            await self.create_user(
                username="admin",
                password="admin123",
                email="admin@ventachat.com",
                tenant_id=None,
                role="super_admin",
            )
            print("✅ Usuario admin por defecto creado (admin/admin123, super_admin)")
        else:
            # Verificar si admin específicamente existe
            admin = await self.get_user_by_username("admin")
            if not admin:
                print("ℹ️  Usuarios existentes en DB, no se crea admin por defecto")

    # ── Administración general: gestión de usuarios de cualquier tenant ───────

    async def list_users(
        self, tenant_id: Optional[str] = None, skip: int = 0, limit: int = 50
    ) -> Dict:
        """Lista usuarios, opcionalmente filtrados por tenant (super_admin)."""
        filters = []
        if tenant_id is not None:
            filters.append(UserModel.tenant_id == tenant_id)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(UserModel).where(*filters)
            )).scalar_one()
            result = await session.execute(
                select(UserModel).where(*filters).order_by(UserModel.created_at.desc())
                .offset(skip).limit(limit)
            )
            rows = result.scalars().all()

        return {
            "users": [_to_user_in_db(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit,
        }

    async def update_user(
        self,
        username: str,
        role: Optional[str] = None,
        disabled: Optional[bool] = None,
        email: Optional[str] = None,
    ) -> Optional[UserInDB]:
        """Actualiza rol/estado/email de un usuario (super_admin). El rol
        nunca lo puede fijar el propio usuario — sólo administración general."""
        async with AsyncSessionLocal() as session:
            row = await session.get(UserModel, username)
            if not row:
                return None
            if role is not None:
                row.role = role
            if disabled is not None:
                row.disabled = disabled
            if email is not None:
                row.email = email
            await session.commit()
            await session.refresh(row)
            return _to_user_in_db(row)

    async def delete_user(self, username: str) -> bool:
        """Elimina un usuario. Falla (False) si tiene bots asociados
        (bots.owner_id) que dependan de esa cuenta."""
        async with AsyncSessionLocal() as session:
            row = await session.get(UserModel, username)
            if not row:
                return False
            try:
                await session.delete(row)
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return False
            return True


# Instancia global del servicio
_user_service: Optional[UserService] = None


def get_user_service() -> UserService:
    """Obtiene la instancia del servicio de usuarios (singleton)"""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service
