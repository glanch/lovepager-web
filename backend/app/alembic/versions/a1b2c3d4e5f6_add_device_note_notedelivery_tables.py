"""Add device, note and notedelivery tables

Revision ID: a1b2c3d4e5f6
Revises: fe56fa70289e
Create Date: 2026-09-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'fe56fa70289e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'device',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('token_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_device_token_hash'), 'device', ['token_hash'], unique=True)

    op.create_table(
        'note',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('sender_id', sa.Uuid(), nullable=False),
        sa.Column('recipient_id', sa.Uuid(), nullable=False),
        sa.Column('text', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('min_retention', sa.Interval(), nullable=False),
        sa.Column('max_retention', sa.Interval(), nullable=True),
        sa.ForeignKeyConstraint(['recipient_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'notedelivery',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('note_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.Uuid(), nullable=False),
        sa.Column('received', sa.Boolean(), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['device_id'], ['device.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['note_id'], ['note.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notedelivery_device_id'), 'notedelivery', ['device_id'], unique=False)
    op.create_index(op.f('ix_notedelivery_note_id'), 'notedelivery', ['note_id'], unique=False)
    op.create_index(op.f('ix_notedelivery_received'), 'notedelivery', ['received'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_notedelivery_received'), table_name='notedelivery')
    op.drop_index(op.f('ix_notedelivery_note_id'), table_name='notedelivery')
    op.drop_index(op.f('ix_notedelivery_device_id'), table_name='notedelivery')
    op.drop_table('notedelivery')
    op.drop_table('note')
    op.drop_index(op.f('ix_device_token_hash'), table_name='device')
    op.drop_table('device')
