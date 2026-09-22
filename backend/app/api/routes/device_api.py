import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from app import crud
from app.api.deps import CurrentDevice, SessionDep
from app.models import (
    DEVICE_STATUS_ACTIVE,
    DeviceHandshakePublic,
    DeviceNotePublic,
    DevicePublic,
    Message,
    NoteDelivery,
    get_datetime_utc,
)

router = APIRouter(prefix="/device", tags=["device"])


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
