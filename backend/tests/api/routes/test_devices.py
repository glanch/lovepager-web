from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.device import create_device, create_registered_device


def test_create_device_returns_registration_info(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    info = create_device(
        client=client, token_headers=normal_user_token_headers, name="Kitchen"
    )
    assert info["name"] == "Kitchen"
    assert info["token"]
    assert "device_id" in info
    assert info["api_url"].endswith(settings.API_V1_STR)


def test_register_activates_device(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    info = create_device(client=client, token_headers=normal_user_token_headers)

    handshake = client.post(
        f"{settings.API_V1_STR}/device/register",
        headers={"Authorization": f"Bearer {info['token']}"},
    )
    assert handshake.status_code == 200
    body = handshake.json()
    assert body["device"]["status"] == "active"
    assert body["server_time"]


def test_register_with_invalid_token(client: TestClient) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/device/register",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401


def test_list_devices(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    create_device(client=client, token_headers=normal_user_token_headers)
    response = client.get(
        f"{settings.API_V1_STR}/devices/", headers=normal_user_token_headers
    )
    assert response.status_code == 200
    content = response.json()
    assert content["count"] >= 1
    assert len(content["data"]) >= 1


def test_next_note_empty_queue(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    info = create_registered_device(
        client=client, token_headers=normal_user_token_headers
    )
    response = client.get(
        f"{settings.API_V1_STR}/device/notes/next",
        headers={"Authorization": f"Bearer {info['token']}"},
    )
    assert response.status_code == 200
    assert response.json() is None


def test_rename_and_delete_device(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    info = create_device(client=client, token_headers=normal_user_token_headers)
    device_id = info["device_id"]

    renamed = client.patch(
        f"{settings.API_V1_STR}/devices/{device_id}",
        headers=normal_user_token_headers,
        json={"name": "Renamed"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    deleted = client.delete(
        f"{settings.API_V1_STR}/devices/{device_id}",
        headers=normal_user_token_headers,
    )
    assert deleted.status_code == 200
