import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    Device,
    DeviceCreate,
    DevicePublic,
    DeviceRegistrationInfo,
    DevicesPublic,
    DeviceUpdate,
    Message,
)

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/", response_model=DevicesPublic)
def read_devices(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve the current user's devices.
    """
    count_statement = (
        select(func.count())
        .select_from(Device)
        .where(Device.owner_id == current_user.id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(Device)
        .where(Device.owner_id == current_user.id)
        .order_by(col(Device.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    devices = session.exec(statement).all()
    return DevicesPublic(
        data=[DevicePublic.model_validate(d) for d in devices], count=count
    )


@router.post("/", response_model=DeviceRegistrationInfo)
def create_device(
    *, session: SessionDep, current_user: CurrentUser, device_in: DeviceCreate
) -> Any:
    """
    Register a new device. Returns the one-time QR payload (including the raw
    token) the gadget uses to complete registration. The token is not retrievable
    afterwards.
    """
    device, raw_token = crud.create_device(
        session=session, owner_id=current_user.id, name=device_in.name
    )
    return DeviceRegistrationInfo(
        api_url=f"{settings.DEVICE_API_URL}{settings.API_V1_STR}",
        device_id=device.id,
        token=raw_token,
        name=device.name,
    )


@router.patch("/{id}", response_model=DevicePublic)
def update_device(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    device_in: DeviceUpdate,
) -> Any:
    """
    Rename a device.
    """
    device = session.get(Device, id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    update_dict = device_in.model_dump(exclude_unset=True)
    device.sqlmodel_update(update_dict)
    session.add(device)
    session.commit()
    session.refresh(device)
    return device


@router.delete("/{id}")
def delete_device(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete a device.
    """
    device = session.get(Device, id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    session.delete(device)
    session.commit()
    return Message(message="Device deleted successfully")
