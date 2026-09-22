import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Device,
    Note,
    NoteCreate,
    NoteDelivery,
    NoteDeliveryPublic,
    NoteDetailPublic,
    NotePublic,
    NotesPublic,
    User,
)

router = APIRouter(prefix="/notes", tags=["notes"])


def _retention_seconds(delta: Any) -> int | None:
    return None if delta is None else int(delta.total_seconds())


def _build_note_public(session: SessionDep, note: Note) -> NotePublic:
    delivered_count = session.exec(
        select(func.count())
        .select_from(NoteDelivery)
        .where(NoteDelivery.note_id == note.id)
    ).one()
    received_count = session.exec(
        select(func.count())
        .select_from(NoteDelivery)
        .where(
            NoteDelivery.note_id == note.id,
            NoteDelivery.received == True,  # noqa: E712
        )
    ).one()
    recipient = session.get(User, note.recipient_id)
    sender = session.get(User, note.sender_id)
    return NotePublic(
        id=note.id,
        text=note.text,
        sender_id=note.sender_id,
        recipient_id=note.recipient_id,
        recipient_name=recipient.full_name if recipient else None,
        sender_name=sender.full_name if sender else None,
        created_at=note.created_at,
        min_retention_seconds=_retention_seconds(note.min_retention) or 0,
        max_retention_seconds=_retention_seconds(note.max_retention),
        delivered_count=delivered_count,
        received_count=received_count,
    )


@router.get("/", response_model=NotesPublic)
def read_notes(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve notes the current user has sent.
    """
    count = session.exec(
        select(func.count())
        .select_from(Note)
        .where(Note.sender_id == current_user.id)
    ).one()
    notes = session.exec(
        select(Note)
        .where(Note.sender_id == current_user.id)
        .order_by(col(Note.created_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return NotesPublic(
        data=[_build_note_public(session, n) for n in notes], count=count
    )


@router.get("/inbox", response_model=NotesPublic)
def read_inbox(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve notes addressed to the current user.
    """
    count = session.exec(
        select(func.count())
        .select_from(Note)
        .where(Note.recipient_id == current_user.id)
    ).one()
    notes = session.exec(
        select(Note)
        .where(Note.recipient_id == current_user.id)
        .order_by(col(Note.created_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return NotesPublic(
        data=[_build_note_public(session, n) for n in notes], count=count
    )


@router.get("/{id}", response_model=NoteDetailPublic)
def read_note(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get a note by ID, including its per-device delivery status.
    """
    note = session.get(Note, id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if current_user.id not in (note.sender_id, note.recipient_id):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    rows = session.exec(
        select(NoteDelivery, Device)
        .join(Device, col(NoteDelivery.device_id) == col(Device.id))
        .where(NoteDelivery.note_id == note.id)
        .order_by(col(Device.name).asc())
    ).all()
    deliveries = [
        NoteDeliveryPublic(
            id=delivery.id,
            device_id=device.id,
            device_name=device.name,
            received=delivery.received,
            received_at=delivery.received_at,
        )
        for delivery, device in rows
    ]

    base = _build_note_public(session, note)
    return NoteDetailPublic(**base.model_dump(), deliveries=deliveries)


@router.post("/", response_model=NotePublic)
def create_note(
    *, session: SessionDep, current_user: CurrentUser, note_in: NoteCreate
) -> Any:
    """
    Send a note to another user. It is fanned out to the recipient's active devices.
    """
    recipient = session.get(User, note_in.recipient_id)
    if not recipient or not recipient.is_active:
        raise HTTPException(status_code=404, detail="Recipient not found")
    note = crud.create_note(
        session=session, sender_id=current_user.id, note_in=note_in
    )
    return _build_note_public(session, note)
