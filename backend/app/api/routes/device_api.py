import io
import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import select

from app import crud
from app.api.deps import CurrentDevice, SessionDep
from app.core.config import settings
from app.models import (
    DEFAULT_MIN_RETENTION,
    DEVICE_STATUS_ACTIVE,
    DeviceAudioUploadAck,
    DeviceHandshakePublic,
    DeviceNotePublic,
    DevicePublic,
    Message,
    Note,
    NoteDelivery,
    NOTE_MEDIA_AUDIO,
    get_datetime_utc,
)

router = APIRouter(prefix="/device", tags=["device"])

AUDIO_CHUNK_SIZE = 4096  # matches the gadget's mbedTLS SSL_IN/OUT_CONTENT_LEN


def _audio_url(note_id: uuid.UUID) -> str:
    return f"{settings.DEVICE_API_URL}{settings.API_V1_STR}/device/notes/{note_id}/audio"


def _retention_seconds(delta: Any) -> int | None:
    if delta is None:
        return None
    return int(delta.total_seconds())


@router.post("/register", response_model=DeviceHandshakePublic)
def register_device(session: SessionDep, device: CurrentDevice) -> Any:
    """
    Handshake called by the gadget after scanning its QR code. Marks the device
    active and returns the current server time for clock sync.
    """
    device.status = DEVICE_STATUS_ACTIVE
    device.last_seen_at = get_datetime_utc()
    session.add(device)
    session.commit()
    session.refresh(device)
    return DeviceHandshakePublic(
        device=DevicePublic.model_validate(device),
        server_time=get_datetime_utc(),
    )


@router.get("/notes/next", response_model=DeviceNotePublic | None)
def get_next_note(session: SessionDep, device: CurrentDevice) -> Any:
    """
    Return the oldest unreceived note for this device, or null if the queue is
    empty. Stamps the device as recently seen.
    """
    device.last_seen_at = get_datetime_utc()
    session.add(device)

    delivery, note, remaining = crud.get_next_delivery_for_device(
        session=session, device=device
    )
    session.commit()

    if delivery is None or note is None:
        return None

    return DeviceNotePublic(
        delivery_id=delivery.id,
        note_id=note.id,
        text=note.text,
        media_type=note.media_type,
        audio_url=(
            _audio_url(note.id) if note.media_type == NOTE_MEDIA_AUDIO else None
        ),
        audio_duration_ms=note.audio_duration_ms,
        min_retention_seconds=_retention_seconds(note.min_retention) or 0,
        max_retention_seconds=_retention_seconds(note.max_retention),
        created_at=note.created_at,
        queue_remaining=remaining,
        server_time=get_datetime_utc(),
    )


@router.post("/notes/{delivery_id}/received", response_model=Message)
def mark_note_received(
    session: SessionDep, device: CurrentDevice, delivery_id: uuid.UUID
) -> Any:
    """
    Mark a delivered note as received (displayed) on this device.
    """
    delivery = session.get(NoteDelivery, delivery_id)
    if not delivery or delivery.device_id != device.id:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if not delivery.received:
        delivery.received = True
        delivery.received_at = get_datetime_utc()
        device.last_seen_at = get_datetime_utc()
        session.add(delivery)
        session.add(device)
        session.commit()
    return Message(message="Marked as received")


def _iter_audio_chunks(data: bytes) -> Any:
    buf = io.BytesIO(data)
    while chunk := buf.read(AUDIO_CHUNK_SIZE):
        yield chunk


@router.get("/notes/{note_id}/audio")
def get_note_audio(
    session: SessionDep, device: CurrentDevice, note_id: uuid.UUID
) -> StreamingResponse:
    """
    Stream a note's audio payload for gadget playback. Only devices with a
    delivery for this note may fetch it.
    """
    delivery = session.exec(
        select(NoteDelivery).where(
            NoteDelivery.note_id == note_id, NoteDelivery.device_id == device.id
        )
    ).first()
    if delivery is None:
        raise HTTPException(status_code=404, detail="Note not found")
    note = session.get(Note, note_id)
    if note is None or note.audio_data is None:
        raise HTTPException(status_code=404, detail="Note has no audio")
    return StreamingResponse(
        _iter_audio_chunks(note.audio_data), media_type=note.audio_mime
    )


@router.post("/audio/upload", response_model=DeviceAudioUploadAck)
async def upload_audio_note(
    request: Request,
    session: SessionDep,
    device: CurrentDevice,
    duration_ms: int,
    min_retention_seconds: int | None = None,
    max_retention_seconds: int | None = None,
) -> Any:
    """
    Accept a raw audio/wav recording from the gadget and send it to the
    device owner's partner, fanned out to their active devices.
    """
    owner = device.owner
    if owner is None or owner.partner_id is None:
        raise HTTPException(
            status_code=400, detail="Device owner has no partner to send to"
        )
    audio_data = await request.body()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty audio payload")

    note = crud.create_audio_note(
        session=session,
        sender_id=owner.id,
        recipient_id=owner.partner_id,
        audio_data=audio_data,
        audio_mime=request.headers.get("content-type", "audio/wav"),
        audio_duration_ms=duration_ms,
        min_retention=(
            timedelta(seconds=min_retention_seconds)
            if min_retention_seconds is not None
            else DEFAULT_MIN_RETENTION
        ),
        max_retention=(
            timedelta(seconds=max_retention_seconds)
            if max_retention_seconds is not None
            else None
        ),
    )
    device.last_seen_at = get_datetime_utc()
    session.add(device)
    session.commit()
    return DeviceAudioUploadAck(note_id=note.id)
