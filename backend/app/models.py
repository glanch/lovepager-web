import uuid
from datetime import UTC, datetime, timedelta

from pydantic import EmailStr
from sqlalchemy import DateTime, Interval, LargeBinary
from sqlmodel import Field, Relationship, SQLModel

# Default retention: a note stays displayed at least this long before the device
# is allowed to rotate to the next queued note.
DEFAULT_MIN_RETENTION = timedelta(hours=1)


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    partner_id: uuid.UUID | None = None


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    partner_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", nullable=True
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list[Item] = Relationship(back_populates="owner", cascade_delete=True)
    devices: list["Device"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    partner_id: uuid.UUID | None = None
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Device statuses
DEVICE_STATUS_PENDING = "pending"
DEVICE_STATUS_ACTIVE = "active"


# Shared properties
class DeviceBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)


# Properties to receive on device creation
class DeviceCreate(DeviceBase):
    pass


# Properties to receive on device update
class DeviceUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


# Database model
class Device(DeviceBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    # sha256 hex digest of the device bearer token (the raw token is never stored)
    token_hash: str = Field(unique=True, index=True, max_length=64)
    status: str = Field(default=DEVICE_STATUS_PENDING, max_length=20)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    last_seen_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner: User | None = Relationship(back_populates="devices")
    deliveries: list["NoteDelivery"] = Relationship(
        back_populates="device", cascade_delete=True
    )


# Properties to return via API
class DevicePublic(DeviceBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    status: str
    created_at: datetime | None = None
    last_seen_at: datetime | None = None


class DevicesPublic(SQLModel):
    data: list[DevicePublic]
    count: int


# Returned once, on device creation: the payload encoded into the QR code so the
# gadget can register itself. The raw token is only ever exposed here.
class DeviceRegistrationInfo(SQLModel):
    api_url: str
    device_id: uuid.UUID
    token: str
    name: str


# Media type discriminator for a note's content
NOTE_MEDIA_TEXT = "text"
NOTE_MEDIA_AUDIO = "audio"


# Shared properties
class NoteBase(SQLModel):
    # Body text. Required for text notes; for audio notes this holds a caption /
    # fallback string so older gadget firmware (which only ever reads `.text`)
    # still has something legible to display.
    text: str = Field(default="", max_length=1000)
    media_type: str = Field(default=NOTE_MEDIA_TEXT, max_length=10)


# Properties to receive on text note creation
class NoteCreate(SQLModel):
    text: str = Field(min_length=1, max_length=1000)
    recipient_id: uuid.UUID
    min_retention: timedelta = DEFAULT_MIN_RETENTION
    # None means the note never auto-expires (infinite max retention)
    max_retention: timedelta | None = None


# Database model
class Note(NoteBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    sender_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    recipient_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    min_retention: timedelta = Field(
        default=DEFAULT_MIN_RETENTION,
        sa_type=Interval,  # type: ignore
    )
    max_retention: timedelta | None = Field(
        default=None,
        sa_type=Interval,  # type: ignore
    )
    # Audio note payload. NULL for text notes. Never exposed directly via
    # NotePublic/DeviceNotePublic — always streamed through a dedicated
    # /audio endpoint instead.
    audio_data: bytes | None = Field(default=None, sa_type=LargeBinary)
    audio_mime: str = Field(default="audio/wav", max_length=40)
    audio_duration_ms: int | None = None
    deliveries: list["NoteDelivery"] = Relationship(
        back_populates="note", cascade_delete=True
    )


# Per-device fan-out of a note. One row per recipient device.
class NoteDelivery(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    note_id: uuid.UUID = Field(
        foreign_key="note.id", nullable=False, ondelete="CASCADE", index=True
    )
    device_id: uuid.UUID = Field(
        foreign_key="device.id", nullable=False, ondelete="CASCADE", index=True
    )
    received: bool = Field(default=False, index=True)
    received_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    note: Note | None = Relationship(back_populates="deliveries")
    device: Device | None = Relationship(back_populates="deliveries")


# Delivery status of a note on a single device (for the sender's "who received it" view)
class NoteDeliveryPublic(SQLModel):
    id: uuid.UUID
    device_id: uuid.UUID
    device_name: str
    received: bool
    received_at: datetime | None = None


# Properties to return via API for a sent/received note
class NotePublic(NoteBase):
    id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: uuid.UUID
    recipient_name: str | None = None
    sender_name: str | None = None
    created_at: datetime | None = None
    min_retention_seconds: int
    max_retention_seconds: int | None = None
    delivered_count: int = 0
    received_count: int = 0
    audio_duration_ms: int | None = None


class NotesPublic(SQLModel):
    data: list[NotePublic]
    count: int


class NoteDetailPublic(NotePublic):
    deliveries: list[NoteDeliveryPublic] = []


# The device poll payload: the next unreceived note plus queue/clock metadata
class DeviceNotePublic(SQLModel):
    delivery_id: uuid.UUID
    note_id: uuid.UUID
    text: str
    min_retention_seconds: int
    max_retention_seconds: int | None = None
    created_at: datetime
    queue_remaining: int
    server_time: datetime
    # Additive/nullable fields — old gadget firmware ignores unknown keys and
    # keeps working unmodified.
    media_type: str = NOTE_MEDIA_TEXT
    audio_url: str | None = None
    audio_duration_ms: int | None = None


# Device handshake / registration response
class DeviceHandshakePublic(SQLModel):
    device: DevicePublic
    server_time: datetime


# Ack returned to the gadget after it uploads a recorded voice note
class DeviceAudioUploadAck(SQLModel):
    note_id: uuid.UUID


# A single user match for the recipient picker
class UserSearchResult(SQLModel):
    id: uuid.UUID
    full_name: str | None = None
    email: EmailStr


class UsersSearchPublic(SQLModel):
    data: list[UserSearchResult]


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
