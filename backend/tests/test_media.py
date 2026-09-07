import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.models.subject import Subject


def create_test_image_bytes(format="PNG", size=(100, 100), color="blue") -> bytes:
    """Helper to generate valid in-memory image bytes."""
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


@pytest.fixture
def auth_headers(client: TestClient, test_admin: User) -> dict:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": test_admin.username, "password": "SecretAdminPass123!"},
    )
    assert resp.status_code == 200
    token = resp.cookies[settings.SESSION_COOKIE_NAME]
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    return {}


def test_upload_valid_image(client: TestClient, auth_headers):
    img_bytes = create_test_image_bytes(format="PNG", size=(200, 150))
    files = {"file": ("test_diagram.png", img_bytes, "image/png")}

    resp = client.post("/api/v1/media", files=files)
    assert resp.status_code == 201
    data = resp.json()

    assert data["original_filename"] == "test_diagram.png"
    assert data["mime_type"] == "image/png"
    assert data["width"] == 200
    assert data["height"] == 150
    assert "questions/" in data["storage_key"]
    assert data["url"] is not None

    # Test file serving endpoint
    file_url = data["url"]
    file_resp = client.get(file_url)
    assert file_resp.status_code == 200
    assert len(file_resp.content) == len(img_bytes)


def test_upload_invalid_mime_type(client: TestClient, auth_headers):
    files = {"file": ("malicious.txt", b"plain text content", "text/plain")}
    resp = client.post("/api/v1/media", files=files)
    assert resp.status_code == 400
    assert "Unsupported image type" in resp.json()["detail"]


def test_upload_corrupted_image_content(client: TestClient, auth_headers):
    # Spoofed image: content_type is image/png but content is random garbage
    files = {"file": ("corrupt.png", b"NOT AN IMAGE HEADER AT ALL", "image/png")}
    resp = client.post("/api/v1/media", files=files)
    assert resp.status_code == 400
    assert "Invalid or corrupted image" in resp.json()["detail"]


def test_media_association_with_question(client: TestClient, auth_headers, db_session):
    subject = Subject(name="Biology", code="BIO", status="ACTIVE")
    db_session.add(subject)
    db_session.commit()

    # 1. Upload 2 images
    img1 = create_test_image_bytes("JPEG", (100, 100), "red")
    img2 = create_test_image_bytes("PNG", (120, 120), "green")

    r1 = client.post("/api/v1/media", files={"file": ("img1.jpg", img1, "image/jpeg")})
    assert r1.status_code == 201
    m1_id = r1.json()["id"]

    r2 = client.post("/api/v1/media", files={"file": ("img2.png", img2, "image/png")})
    assert r2.status_code == 201
    m2_id = r2.json()["id"]

    # 2. Create question with media_ids
    q_resp = client.post(
        "/api/v1/questions",
        json={
            "question_type": "NUMERICAL",
            "subject_id": str(subject.id),
            "content": "Refer to the diagrams below to determine cell count.",
            "numerical_answer": 4.0,
            "media_ids": [m1_id, m2_id],
        },
    )
    assert q_resp.status_code == 201
    q_data = q_resp.json()
    assert len(q_data["media"]) == 2
    assert q_data["media"][0]["id"] == m1_id
    assert q_data["media"][1]["id"] == m2_id


def test_delete_media(client: TestClient, auth_headers):
    img = create_test_image_bytes("PNG")
    r = client.post("/api/v1/media", files={"file": ("temp.png", img, "image/png")})
    assert r.status_code == 201
    media_id = r.json()["id"]

    # Delete media
    del_resp = client.delete(f"/api/v1/media/{media_id}")
    assert del_resp.status_code == 204

    # Verification: should be 404
    get_resp = client.get(f"/api/v1/media/{media_id}")
    assert get_resp.status_code == 404
