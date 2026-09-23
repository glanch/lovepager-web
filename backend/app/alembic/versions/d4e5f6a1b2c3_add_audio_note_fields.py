"""add audio note fields

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-09-23

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

revision = "d4e5f6a1b2c3"
down_revision = "c3d4e5f6a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "note",
        "text",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=1000),
        nullable=False,
        server_default="",
    )
    op.add_column(
        "note",
        sa.Column(
            "media_type",
            sqlmodel.sql.sqltypes.AutoString(length=10),
            nullable=False,
            server_default="text",
        ),
    )
    op.add_column("note", sa.Column("audio_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "note",
        sa.Column(
            "audio_mime",
            sqlmodel.sql.sqltypes.AutoString(length=40),
            nullable=False,
            server_default="audio/wav",
        ),
    )
    op.add_column(
        "note", sa.Column("audio_duration_ms", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("note", "audio_duration_ms")
    op.drop_column("note", "audio_mime")
    op.drop_column("note", "audio_data")
    op.drop_column("note", "media_type")
    op.alter_column(
        "note",
        "text",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=1000),
        nullable=False,
        server_default=None,
    )
