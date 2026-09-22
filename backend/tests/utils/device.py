from fastapi.testclient import TestClient

from app.core.config import settings


def create_device(
    *, client: TestClient, token_headers: dict[str, str], name: str = "Test pager"
) -> dict:
    """Create a device and return its DeviceRegistrationInfo (incl. raw token)."""
    response = client.post(
        f"{settings.API_V1_STR}/devices/",
        headers=token_headers,
        json={"name": name},
    )
    assert response.status_code == 200
    return response.json()


def register_device(*, client: TestClient, token: str) -> dict:
    """Run the device handshake and return the response."""
    response = client.post(
        f"{settings.API_V1_STR}/device/register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def create_registered_device(
    *, client: TestClient, token_headers: dict[str, str], name: str = "Test pager"
) -> dict:
    """Create a device and complete its registration; return the QR payload dict."""
    info = create_device(client=client, token_headers=token_headers, name=name)
    register_device(client=client, token=info["token"])
    return info
