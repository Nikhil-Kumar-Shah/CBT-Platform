import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Response
from fastapi.responses import Response as RawResponse
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import require_admin
from backend.app.models.question_media import QuestionMedia
from backend.app.schemas.media import MediaResponse
from backend.app.services.media import MediaService
from backend.app.services.storage import get_storage_provider

router = APIRouter(prefix="/media", tags=["Media"])


@router.post("", response_model=MediaResponse, status_code=status.HTTP_201_CREATED, summary="Upload Media")
def upload_media(
    file: UploadFile = File(...),
    question_id: Optional[uuid.UUID] = Form(None),
    exam_id: Optional[uuid.UUID] = Form(None),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """Upload an image file (PNG, JPEG, WebP, GIF) to Azure Blob Storage / Local Storage with strict image verification."""
    return MediaService.upload_image(
        db=db,
        file=file,
        created_by=admin.id,
        question_id=question_id,
        exam_id=exam_id,
    )


@router.get("/{media_id}", response_model=MediaResponse, summary="Get Media Metadata")
def get_media(
    media_id: uuid.UUID,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    media = db.get(QuestionMedia, media_id)
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    return MediaService.get_media_response(media)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete Media")
def delete_media(
    media_id: uuid.UUID,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    success = MediaService.delete_media(db, media_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    return None


@router.get("/file/{storage_key:path}", summary="Serve Media File")
def serve_media_file(
    storage_key: str,
    db: Session = Depends(get_db),
):
    """Serve media content directly from Azure Blob Storage.
    
    Ensures anonymous public access can remain disabled on the cloud container
    while images render seamlessly across student exams and question previews.
    Local storage fallback is disabled.
    """
    clean_key = storage_key.replace("\\", "/").strip("/")
    from sqlalchemy import select
    media = db.scalar(select(QuestionMedia).where(QuestionMedia.storage_key == clean_key))
    mime_type = media.mime_type if media else "image/jpeg"

    storage_provider = get_storage_provider()
    try:
        data = storage_provider.get_file(clean_key)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on storage.")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to retrieve image: {e}")

    headers = {
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
    }
    if media:
        headers["ETag"] = f'"{media.id}"'

    return RawResponse(content=data, media_type=mime_type, headers=headers)

