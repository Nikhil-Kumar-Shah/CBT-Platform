import io
import uuid
import pytest
from unittest.mock import MagicMock, patch
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.core.config import settings, validate_storage_configuration
from backend.app.models.user import User
from backend.app.models.question_media import QuestionMedia
from backend.app.models.subject import Subject
from backend.app.models.test import Test
from backend.app.services.storage import (
    AzureBlobStorageProvider,
    get_storage_provider,
)
from backend.app.services.media import MediaService


def create_test_image_bytes(format_name: str = "PNG", size=(100, 100), color=(255, 0, 0)) -> bytes:
    """Helper to generate a real, valid image in-memory."""
    buf = io.BytesIO()
    mode = "RGB" if format_name.upper() != "RGBA" else "RGBA"
    img = Image.new(mode, size, color=color)
    img.save(buf, format=format_name)
    return buf.getvalue()


def test_storage_env_validation_missing_conn_string():
    """Verify clear, informative startup error when AZURE_STORAGE_CONNECTION_STRING is missing."""
    with patch.object(settings, "STORAGE_BACKEND", "azure"), \
         patch.object(settings, "AZURE_STORAGE_CONNECTION_STRING", None):
        with pytest.raises(RuntimeError) as exc_info:
            validate_storage_configuration()
        assert "CRITICAL CONFIGURATION ERROR" in str(exc_info.value)
        assert "AZURE_STORAGE_CONNECTION_STRING is missing" in str(exc_info.value)


def test_storage_env_validation_missing_container_name():
    """Verify clear startup error when AZURE_STORAGE_CONTAINER_NAME is empty."""
    with patch.object(settings, "STORAGE_BACKEND", "azure"), \
         patch.object(settings, "AZURE_STORAGE_CONNECTION_STRING", "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=fake;EndpointSuffix=core.windows.net"), \
         patch.object(settings, "AZURE_STORAGE_CONTAINER_NAME", ""):
        with pytest.raises(RuntimeError) as exc_info:
            validate_storage_configuration()
        assert "AZURE_STORAGE_CONTAINER_NAME is missing" in str(exc_info.value)


def test_upload_png_image_success(client: TestClient, auth_headers: dict, db_session: Session):
    """Test PNG image upload with Pillow verification and database persistence."""
    png_bytes = create_test_image_bytes("PNG", size=(150, 120), color=(100, 150, 200))
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("physics_diagram.png", png_bytes, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["mime_type"] == "image/png"
    assert data["width"] == 150
    assert data["height"] == 120
    assert data["original_filename"] == "physics_diagram.png"
    assert data["url"].startswith("/api/v1/media/file/")

    # Verify media record in PostgreSQL
    media_id = data["id"]
    media_record = db_session.get(QuestionMedia, uuid.UUID(media_id))
    assert media_record is not None
    assert media_record.file_size == len(png_bytes)

    # Verify file content is retrievable via media endpoint
    serve_resp = client.get(data["url"])
    assert serve_resp.status_code == 200
    assert serve_resp.headers["content-type"] == "image/png"
    assert len(serve_resp.content) == len(png_bytes)


def test_upload_jpeg_image_success(client: TestClient, auth_headers: dict):
    """Test JPEG image upload."""
    jpeg_bytes = create_test_image_bytes("JPEG", size=(200, 180), color=(50, 100, 150))
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("formula_chart.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["mime_type"] == "image/jpeg"
    assert data["width"] == 200
    assert data["height"] == 180


def test_upload_webp_image_success(client: TestClient, auth_headers: dict):
    """Test WebP image upload."""
    webp_bytes = create_test_image_bytes("WEBP", size=(80, 80))
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("graph.webp", webp_bytes, "image/webp")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["mime_type"] == "image/webp"


def test_upload_gif_image_success(client: TestClient, auth_headers: dict):
    """Test GIF image upload."""
    gif_bytes = create_test_image_bytes("GIF", size=(50, 50))
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("animated_loop.gif", gif_bytes, "image/gif")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["mime_type"] == "image/gif"


def test_upload_invalid_mime_type_rejected(client: TestClient, auth_headers: dict):
    """Test rejection of non-image MIME types."""
    dummy_text = b"This is a text document, not an image."
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("notes.txt", dummy_text, "text/plain")},
    )
    assert resp.status_code == 400
    assert "Unsupported image type" in resp.json()["detail"]


def test_upload_corrupted_or_disguised_file_rejected(client: TestClient, auth_headers: dict):
    """Test Pillow deep verification rejects executable or random binary disguised as PNG."""
    disguised_binary = b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 200
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("disguised_script.png", disguised_binary, "image/png")},
    )
    assert resp.status_code == 400
    assert "Invalid or corrupted image" in resp.json()["detail"]


def test_upload_oversized_image_rejected(client: TestClient, auth_headers: dict):
    """Test rejection of files exceeding maximum size limit (5MB)."""
    oversized_bytes = b"\x00" * (settings.MAX_IMAGE_SIZE_BYTES + 1024)
    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("huge_image.png", oversized_bytes, "image/png")},
    )
    assert resp.status_code == 400
    assert "exceeds maximum allowed limit" in resp.json()["detail"]


def test_upload_unauthenticated_rejected(client: TestClient):
    """Test that unauthorized users cannot upload media."""
    png_bytes = create_test_image_bytes("PNG")
    resp = client.post(
        "/api/v1/media",
        files={"file": ("unauth.png", png_bytes, "image/png")},
    )
    assert resp.status_code == 401


def test_hierarchical_storage_key_organization(client: TestClient, auth_headers: dict):
    """Test logical path structure: examinations/{exam_id}/questions/{question_id}/images/{unique_name}."""
    png_bytes = create_test_image_bytes("PNG")
    dummy_exam_id = uuid.uuid4()
    dummy_q_id = uuid.uuid4()

    resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        data={"exam_id": str(dummy_exam_id), "question_id": str(dummy_q_id)},
        files={"file": ("diagram.png", png_bytes, "image/png")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["storage_key"].startswith(f"examinations/{dummy_exam_id}/questions/{dummy_q_id}/images/")


def test_azure_blob_storage_provider_upload_download_delete():
    """Unit test for AzureBlobStorageProvider with mocked BlobServiceClient."""
    mock_blob_service_client = MagicMock()
    mock_container_client = MagicMock()
    mock_container_client.exists.return_value = True
    mock_blob_client = MagicMock()
    mock_blob_service_client.get_container_client.return_value = mock_container_client
    mock_blob_service_client.get_blob_client.return_value = mock_blob_client

    # Mock download_blob stream
    mock_stream = MagicMock()
    mock_stream.readall.return_value = b"image_payload_bytes"
    mock_blob_client.download_blob.return_value = mock_stream

    with patch("azure.storage.blob.BlobServiceClient.from_connection_string", return_value=mock_blob_service_client):
        provider = AzureBlobStorageProvider(
            connection_string="DefaultEndpointsProtocol=https;AccountName=test;AccountKey=fake;EndpointSuffix=core.windows.net",
            container_name="exam-assets",
        )

        # 1. Save file
        url = provider.save_file(b"image_payload_bytes", "questions/images/sample.png", "image/png")
        assert url == "/api/v1/media/file/questions/images/sample.png"
        mock_blob_client.upload_blob.assert_called_once()

        # 2. Get file
        downloaded = provider.get_file("questions/images/sample.png")
        assert downloaded == b"image_payload_bytes"

        # 3. Delete file
        deleted = provider.delete_file("questions/images/sample.png")
        assert deleted is True
        mock_blob_client.delete_blob.assert_called_once()


def test_azure_upload_failure_propagates_clean_error(client: TestClient, auth_headers: dict, db_session: Session):
    """Test that Azure upload failures abort the operation without corrupting the DB."""
    png_bytes = create_test_image_bytes("PNG")

    with patch("backend.app.services.media.get_storage_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.save_file.side_effect = RuntimeError("Azure Service Unavailable (Connection Timeout)")
        mock_get_provider.return_value = mock_provider

        resp = client.post(
            "/api/v1/media",
            headers=auth_headers,
            files={"file": ("failing_diagram.png", png_bytes, "image/png")},
        )
        assert resp.status_code == 500
        assert "Storage upload error" in resp.json()["detail"]

        # Ensure no orphan record in DB
        db_records = db_session.scalars(select(QuestionMedia).where(QuestionMedia.original_filename == "failing_diagram.png")).all()
        assert len(db_records) == 0


def test_end_to_end_question_with_diagram_and_student_exam_rendering(client: TestClient, auth_headers: dict):
    """Complete E2E workflow: Upload image -> attach to question -> publish test -> student exam loads diagram."""
    # 1. Upload diagram
    png_bytes = create_test_image_bytes("PNG", size=(300, 200), color=(0, 128, 255))
    upload_resp = client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("ray_optics.png", png_bytes, "image/png")},
    )
    assert upload_resp.status_code == 201
    media_url = upload_resp.json()["url"]

    # 2. Create subject
    subj_resp = client.post(
        "/api/v1/subjects",
        headers=auth_headers,
        json={"name": "Optics and Light", "code": "OPT001"},
    )
    subj_id = subj_resp.json()["id"]

    # 3. Create question containing diagram markdown
    q_content = f"Observe the ray optics diagram below:\n\n![Ray Diagram]({media_url})\n\nWhat is the angle of refraction?"
    q_resp = client.post(
        "/api/v1/questions",
        headers=auth_headers,
        json={
            "subject_id": subj_id,
            "question_type": "MCQ",
            "content": q_content,
            "difficulty": "MEDIUM",
            "options": [
                {"content": "30°", "is_correct": True, "option_order": 1},
                {"content": "45°", "is_correct": False, "option_order": 2},
                {"content": "60°", "is_correct": False, "option_order": 3},
                {"content": "90°", "is_correct": False, "option_order": 4},
            ],
        },
    )
    assert q_resp.status_code == 201
    q_id = q_resp.json()["id"]

    # 4. Create and publish test paper
    test_resp = client.post(
        "/api/v1/tests",
        headers=auth_headers,
        json={
            "title": "Optics Midterm Examination",
            "subject_id": subj_id,
            "duration_minutes": 45,
            "question_ids": [q_id],
        },
    )
    assert test_resp.status_code == 201
    test_id = test_resp.json()["id"]
    test_code = test_resp.json()["code"]

    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish", headers=auth_headers)
    assert pub_resp.status_code == 200

    # 5. Student accesses exam with access code
    candidate_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_code,
            "candidate_name": "Albert Einstein",
        },
    )
    assert candidate_resp.status_code == 201
    candidate_data = candidate_resp.json()
    attempt_id = candidate_data["attempt_id"]

    # 6. Retrieve exam state and confirm diagram URL is present in question content
    state_resp = client.get(f"/api/v1/attempts/{attempt_id}/state")
    assert state_resp.status_code == 200
    questions = state_resp.json()["questions"]
    assert len(questions) == 1
    assert media_url in questions[0]["content"]

    # 7. Confirm image is directly accessible to candidate
    img_resp = client.get(media_url)
    assert img_resp.status_code == 200
    assert img_resp.headers["content-type"] == "image/png"
    assert len(img_resp.content) == len(png_bytes)
