"""merge prospects into clients

Revision ID: c9a72e5f1b3d
Revises: a1b2c3d4e5f6
Create Date: 2026-07-15T13:36:17.524523+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9a72e5f1b3d'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Client absorbe los 3 campos propios de Prospect (ver docs/dev/DECISIONS.md).
    # server_default backfillea 'nuevo' en los clients ya existentes.
    op.add_column('clients', sa.Column('estado', sa.Text(), nullable=False, server_default='nuevo'))
    op.add_column('clients', sa.Column('color_semaforo', sa.Text(), nullable=True))
    op.add_column('clients', sa.Column('notas', sa.Text(), nullable=True))
    op.create_check_constraint(
        'ck_clients_color_semaforo',
        'clients',
        "color_semaforo IS NULL OR color_semaforo IN ('verde', 'amarillo', 'rojo')",
    )

    # Migración de datos: prospects -> clients. Sin ORM (los modelos Python ya
    # tienen otro shape para cuando esta migración corra en otro entorno) —
    # todo en SQL crudo contra las tablas tal como quedan en este punto.

    # 1) Prospects que matchean un client existente del mismo tenant por
    #    teléfono (external_id suele SER el teléfono en el canal whatsapp) ->
    #    se vuelcan los campos de calificación sobre ese client. Si matchea
    #    más de uno, se prioriza el de contacto más reciente.
    op.execute("""
        WITH matched AS (
            SELECT DISTINCT ON (p.prospect_id)
                p.prospect_id, c.client_id
            FROM prospects p
            JOIN clients c
              ON c.tenant_id = p.tenant_id
             AND (c.phone = p.whatsapp OR c.external_id = p.whatsapp)
            ORDER BY p.prospect_id, c.last_contact_at DESC
        )
        UPDATE clients
        SET estado = p.estado,
            color_semaforo = p.color_semaforo,
            notas = p.notas
        FROM matched m
        JOIN prospects p ON p.prospect_id = m.prospect_id
        WHERE clients.client_id = m.client_id
    """)

    # 2) Prospects sin match -> se insertan como clients nuevos. bot_id se
    #    resuelve tomando el bot más antiguo del tenant (hoy ningún tenant con
    #    prospects tiene más de un bot, pero la resolución queda determinística
    #    para el caso general).
    op.execute("""
        INSERT INTO clients (
            client_id, bot_id, tenant_id, external_id, source,
            name, email, phone, status, score,
            total_conversations, total_messages, total_tokens_used,
            first_contact_at, last_contact_at,
            estado, color_semaforo, notas, metadata
        )
        SELECT
            'client_' || substr(md5(p.prospect_id || random()::text), 1, 12),
            (SELECT b.bot_id FROM bots b WHERE b.tenant_id = p.tenant_id
             ORDER BY b.created_at ASC LIMIT 1),
            p.tenant_id,
            COALESCE(p.whatsapp, 'prospect_' || p.prospect_id),
            'manual',
            p.nombre,
            p.email,
            p.whatsapp,
            'active',
            0,
            0, 0, 0,
            p.fecha_interaccion,
            p.fecha_interaccion,
            p.estado,
            p.color_semaforo,
            p.notas,
            jsonb_build_object('migrated_from_prospect_id', p.prospect_id)
        FROM prospects p
        WHERE NOT EXISTS (
            SELECT 1 FROM clients c
            WHERE c.tenant_id = p.tenant_id
              AND (c.phone = p.whatsapp OR c.external_id = p.whatsapp)
        )
        AND EXISTS (
            SELECT 1 FROM bots b WHERE b.tenant_id = p.tenant_id
        )
    """)

    op.drop_table('prospects')


def downgrade() -> None:
    # Downgrade best-effort/lossy: no se puede reconstruir el prospect_id
    # original ni el shape sin bot_id a partir de los clients ya fusionados.
    # Alcanza para que "alembic downgrade" no rompa en dev.
    op.create_table(
        'prospects',
        sa.Column('prospect_id', sa.Text(), nullable=False),
        sa.Column('tenant_id', sa.Text(), nullable=False),
        sa.Column('estado', sa.Text(), nullable=False),
        sa.Column('nombre', sa.Text(), nullable=False),
        sa.Column('fecha_interaccion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('canal', sa.Text(), nullable=True),
        sa.Column('whatsapp', sa.Text(), nullable=True),
        sa.Column('email', sa.Text(), nullable=True),
        sa.Column('color_semaforo', sa.Text(), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ),
        sa.PrimaryKeyConstraint('prospect_id'),
        sa.CheckConstraint(
            "color_semaforo IS NULL OR color_semaforo IN ('verde', 'amarillo', 'rojo')",
            name='ck_prospects_color_semaforo',
        ),
    )
    op.create_index('ix_prospects_fecha_interaccion', 'prospects', ['fecha_interaccion'], unique=False)
    op.create_index('ix_prospects_tenant_id', 'prospects', ['tenant_id'], unique=False)

    op.drop_constraint('ck_clients_color_semaforo', 'clients', type_='check')
    op.drop_column('clients', 'notas')
    op.drop_column('clients', 'color_semaforo')
    op.drop_column('clients', 'estado')
