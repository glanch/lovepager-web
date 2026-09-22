import uuid
from typing import Any

from sqlmodel import Session, col, func, or_, select

from app.core.security import (
    generate_device_token,
    get_password_hash,
    hash_device_token,
    verify_password,
)
from app.models import (
    DEVICE_STATUS_ACTIVE,
    Device,
    Item,
    ItemCreate,
    Note,
    NoteCreate,
    NoteDelivery,
    User,
    UserCreate,
    UserUpdate,
)


def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


# Dummy hash to use for timing attack prevention when user is not found
# This is an Argon2 hash of a random password, used to ensure constant-time comparison
DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        # Prevent timing attacks by running password verification even when user doesn't exist
        # This ensures the response time is similar whether or not the email exists
        verify_password(password, DUMMY_HASH)
        return None
    verified, updated_password_hash = verify_password(password, db_user.hashed_password)
    if not verified:
        return None
    if updated_password_hash:
        db_user.hashed_password = updated_password_hash
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
    return db_user


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


def create_device(
    *, session: Session, owner_id: uuid.UUID, name: str
) -> tuple[Device, str]:
    """Create a pending device and return it together with its raw token.

    The raw token is returned only here (for the QR code); the database stores
    only its hash.
    """
    raw_token = generate_device_token()
    device = Device(
        owner_id=owner_id,
        name=name,
        token_hash=hash_device_token(raw_token),
    )
    session.add(device)
    session.commit()
    session.refresh(device)
    return device, raw_token


def create_note(
    *, session: Session, sender_id: uuid.UUID, note_in: NoteCreate
) -> Note:
    """Store a note and fan it out to each active device of the recipient."""
    note = Note(
        text=note_in.text,
        sender_id=sender_id,
        recipient_id=note_in.recipient_id,
        min_retention=note_in.min_retention,
        max_retention=note_in.max_retention,
    )
    session.add(note)
    session.flush()  # assign note.id before creating deliveries

    devices = session.exec(
        select(Device).where(
            Device.owner_id == note_in.recipient_id,
            Device.status == DEVICE_STATUS_ACTIVE,
        )
    ).all()
    for device in devices:
        session.add(NoteDelivery(note_id=note.id, device_id=device.id))

    session.commit()
    session.refresh(note)
    return note


def get_next_delivery_for_device(
    *, session: Session, device: Device
) -> tuple[NoteDelivery | None, Note | None, int]:
    """Return the oldest unreceived delivery for a device plus the queue size."""
    remaining = session.exec(
        select(func.count())
        .select_from(NoteDelivery)
        .where(
            NoteDelivery.device_id == device.id,
            NoteDelivery.received == False,  # noqa: E712
        )
    ).one()

    result = session.exec(
        select(NoteDelivery, Note)
        .join(Note, col(NoteDelivery.note_id) == col(Note.id))
        .where(
            NoteDelivery.device_id == device.id,
            NoteDelivery.received == False,  # noqa: E712
        )
        .order_by(col(Note.created_at).asc())
        .limit(1)
    ).first()

    if result is None:
        return None, None, remaining
    delivery, note = result
    return delivery, note, remaining


def search_users(
    *, session: Session, query: str, limit: int = 20
) -> list[User]:
    """Case-insensitive search over display name and email for the recipient picker.

    Includes the caller themselves, since self-paging (e.g. reminders to your own
    devices) is allowed.
    """
    pattern = f"%{query}%"
    statement = (
        select(User)
        .where(
            User.is_active == True,  # noqa: E712
            or_(
                col(User.full_name).ilike(pattern),
                col(User.email).ilike(pattern),
            ),
        )
        .order_by(col(User.full_name).asc())
        .limit(limit)
    )
    return list(session.exec(statement).all())
