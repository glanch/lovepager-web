from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.device import create_registered_device
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _me_id(client: TestClient, headers: dict[str, str]) -> str:
    return client.get(f"{API}/users/me", headers=headers).json()["id"]


def _new_user(
    client: TestClient, full_name: str | None = None
) -> tuple[str, dict[str, str], str]:
    """Sign up a fresh user (isolated from the shared fixtures) and log in.

    Returns (user_id, auth_headers, email).
    """
    email = random_email()
    password = random_lower_string()
    payload: dict[str, str] = {"email": email, "password": password}
    if full_name:
        payload["full_name"] = full_name
    r = client.post(f"{API}/users/signup", json=payload)
    assert r.status_code == 200, r.text
    headers = user_authentication_headers(
        client=client, email=email, password=password
    )
    return _me_id(client, headers), headers, email


def test_note_fan_out_poll_and_receive(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # A fresh recipient with exactly one registered device.
    recipient_id, recipient_headers, _ = _new_user(client)
    device = create_registered_device(
        client=client, token_headers=recipient_headers
    )
    device_headers = {"Authorization": f"Bearer {device['token']}"}

    # The superuser sends a note (uses the default 1h min retention).
    created = client.post(
        f"{API}/notes/",
        headers=superuser_token_headers,
        json={"recipient_id": recipient_id, "text": "Dinner is ready"},
    )
    assert created.status_code == 200
    note = created.json()
    note_id = note["id"]
    assert note["delivered_count"] == 1
    assert note["received_count"] == 0
    assert note["min_retention_seconds"] == 3600
    assert note["max_retention_seconds"] is None

    # The device polls and receives the queued note.
    poll = client.get(f"{API}/device/notes/next", headers=device_headers)
    assert poll.status_code == 200
    payload = poll.json()
    assert payload["text"] == "Dinner is ready"
    assert payload["queue_remaining"] == 1
    assert payload["min_retention_seconds"] == 3600
    assert payload["server_time"]
    delivery_id = payload["delivery_id"]

    # Mark it received; the queue then drains.
    marked = client.post(
        f"{API}/device/notes/{delivery_id}/received", headers=device_headers
    )
    assert marked.status_code == 200

    empty = client.get(f"{API}/device/notes/next", headers=device_headers)
    assert empty.status_code == 200
    assert empty.json() is None

    # The sender sees the delivery marked as received.
    detail = client.get(f"{API}/notes/{note_id}", headers=superuser_token_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["received_count"] == 1
    assert len(body["deliveries"]) == 1
    assert body["deliveries"][0]["received"] is True


def test_note_queue_orders_oldest_first(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    recipient_id, recipient_headers, _ = _new_user(client)
    device = create_registered_device(
        client=client, token_headers=recipient_headers
    )
    device_headers = {"Authorization": f"Bearer {device['token']}"}

    for text in ("first", "second"):
        client.post(
            f"{API}/notes/",
            headers=superuser_token_headers,
            json={"recipient_id": recipient_id, "text": text},
        )

    p1 = client.get(f"{API}/device/notes/next", headers=device_headers).json()
    assert p1["text"] == "first"
    assert p1["queue_remaining"] == 2
    client.post(
        f"{API}/device/notes/{p1['delivery_id']}/received", headers=device_headers
    )

    p2 = client.get(f"{API}/device/notes/next", headers=device_headers).json()
    assert p2["text"] == "second"
    assert p2["queue_remaining"] == 1


def test_custom_retention_round_trips(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    recipient_id, _, _ = _new_user(client)
    created = client.post(
        f"{API}/notes/",
        headers=superuser_token_headers,
        json={
            "recipient_id": recipient_id,
            "text": "custom retention",
            "min_retention": 30,
            "max_retention": 300,
        },
    ).json()
    assert created["min_retention_seconds"] == 30
    assert created["max_retention_seconds"] == 300


def test_send_note_to_user_without_devices(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    recipient_id, _, _ = _new_user(client)
    created = client.post(
        f"{API}/notes/",
        headers=superuser_token_headers,
        json={"recipient_id": recipient_id, "text": "No devices note"},
    )
    # The note is still stored even if there is nothing to fan out to.
    assert created.status_code == 200
    assert created.json()["delivered_count"] == 0


def test_note_detail_forbidden_for_third_party(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # superuser sends to itself, so a fresh third-party user has no access.
    superuser_id = _me_id(client, superuser_token_headers)
    created = client.post(
        f"{API}/notes/",
        headers=superuser_token_headers,
        json={"recipient_id": superuser_id, "text": "private"},
    )
    note_id = created.json()["id"]
    _, third_party_headers, _ = _new_user(client)
    response = client.get(f"{API}/notes/{note_id}", headers=third_party_headers)
    assert response.status_code == 403


def test_search_users(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    _, _, email = _new_user(client, full_name="Searchable Person")
    response = client.get(
        f"{API}/users/search",
        headers=superuser_token_headers,
        params={"q": email},
    )
    assert response.status_code == 200
    emails = [u["email"] for u in response.json()["data"]]
    assert email in emails
