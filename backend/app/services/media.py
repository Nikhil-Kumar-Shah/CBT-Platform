import io
import uuid
from typing import Optional
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, UploadFile

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.models.question_media import QuestionMedia
from backend.app.schemas.media import MediaResponse
from backend.app.services.storage import get_storage_provider

ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class MediaService:
    @staticmethod
    def upload_image(
        db: Session,
        file: UploadFile,
        created_by: Optional[uuid.UUID] = None,
        question_id: Optional[uuid.UUID] = None,
        exam_id: Optional[uuid.UUID] = None,
    ) -> MediaResponse:
        """Validate and upload an image file to Azure Blob Storage, persisting metadata in PostgreSQL."""
        # 1. MIME type validation
        content_type = file.content_type.lower() if file.content_type else ""
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported image type '{content_type}'. Allowed formats: PNG, JPEG/JPG, WebP, GIF.",
            )

        # 2. Extension validation against MIME type
        ext = ALLOWED_MIME_TYPES[content_type]
        raw_name = file.filename or f"image{ext}"
        # Validate filename extension if present
        if "." in raw_name:
            file_ext = "." + raw_name.rsplit(".", 1)[-1].lower()
            if file_ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File extension '{file_ext}' does not match allowed image formats.",
                )

        # 3. Read and size validation (5MB max)
        content = file.file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )
        if len(content) > settings.MAX_IMAGE_SIZE_BYTES:
            max_mb = settings.MAX_IMAGE_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image size exceeds maximum allowed limit of {max_mb}MB.",
            )

        # 4. Pillow deep validation (actual image content and header integrity check)
        try:
            image = Image.open(io.BytesIO(content))
            image.verify()  # Verify image header and structure
            # Reopen to read dimensions safely (verify closes file pointer in Pillow)
            image = Image.open(io.BytesIO(content))
            width, height = image.size
        except (UnidentifiedImageError, Exception) as e:
            logger.warning("Uploaded image failed verification: %s", e)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or corrupted image file. Please upload a valid PNG, JPG, or WebP image.",
            )

        if width > settings.MAX_IMAGE_DIMENSION or height > settings.MAX_IMAGE_DIMENSION:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image dimensions ({width}x{height}) exceed maximum allowed dimension of {settings.MAX_IMAGE_DIMENSION}px.",
            )

        # 5. Generate collision-resistant hierarchical storage object key
        unique_name = f"{uuid.uuid4().hex}{ext}"
        if exam_id and question_id:
            storage_key = f"examinations/{exam_id}/questions/{question_id}/images/{unique_name}"
        elif question_id:
            storage_key = f"questions/{question_id}/images/{unique_name}"
        elif exam_id:
            storage_key = f"examinations/{exam_id}/images/{unique_name}"
        else:
            storage_key = f"questions/images/{unique_name}"

        # 6. Persist to Azure Blob Storage (Sole Storage Backend)
        # Only proceed to DB commit if cloud storage upload succeeds
        try:
            storage_provider = get_storage_provider()
            url = storage_provider.save_file(
                content=content,
                storage_key=storage_key,
                content_type=content_type,
            )
        except Exception as e:
            logger.error("Azure Blob upload failed for %s: %s", storage_key, e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Storage upload error: {e}",
            )

        # 7. Store metadata in PostgreSQL with strict filename sanitization
        import re
        base_name = raw_name.replace("\\", "/").split("/")[-1]
        clean_filename = re.sub(r"[^\w\.\-\s]", "_", base_name).strip() or unique_name

        # Only link question_id in foreign key if question exists in DB
        persisted_question_id = None
        if question_id:
            from backend.app.models.question import Question
            if db.get(Question, question_id):
                persisted_question_id = question_id

        media_record = QuestionMedia(
            question_id=persisted_question_id,
            storage_key=storage_key,
            original_filename=clean_filename[:255],
            mime_type=content_type,
            file_size=len(content),
            width=width,
            height=height,
            display_order=0,
            created_by=created_by,
        )

        try:
            db.add(media_record)
            db.commit()
            db.refresh(media_record)
        except Exception as db_exc:
            db.rollback()
            logger.error("Database insert failed for media %s after successful Azure upload: %s. Cleaning up orphaned blob.", storage_key, db_exc)
            try:
                storage_provider.delete_file(storage_key)
            except Exception as cleanup_err:
                logger.error("Failed to cleanup orphaned Azure blob %s: %s", storage_key, cleanup_err)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while saving media record.",
            ) from db_exc

        logger.info("Uploaded media_id=%s, storage_key=%s to Azure Blob Storage (container: %s)", media_record.id, storage_key, settings.AZURE_STORAGE_CONTAINER_NAME)

        return MediaResponse(
            id=media_record.id,
            question_id=media_record.question_id,
            storage_key=media_record.storage_key,
            url=url,
            original_filename=media_record.original_filename,
            mime_type=media_record.mime_type,
            file_size=media_record.file_size,
            width=media_record.width,
            height=media_record.height,
            display_order=media_record.display_order,
            created_at=media_record.created_at,
        )

    @staticmethod
    def get_media_response(media: QuestionMedia) -> MediaResponse:
        storage_provider = get_storage_provider()
        url = storage_provider.get_url(media.storage_key)
        return MediaResponse(
            id=media.id,
            question_id=media.question_id,
            storage_key=media.storage_key,
            url=url,
            original_filename=media.original_filename,
            mime_type=media.mime_type,
            file_size=media.file_size,
            width=media.width,
            height=media.height,
            display_order=media.display_order,
            created_at=media.created_at,
        )

    @staticmethod
    def delete_media(db: Session, media_id: uuid.UUID) -> bool:
        media = db.get(QuestionMedia, media_id)
        if not media:
            return False

        storage_provider = get_storage_provider()
        storage_provider.delete_file(media.storage_key)

        db.delete(media)
        db.commit()
        logger.info("Deleted media_id=%s, storage_key=%s", media_id, media.storage_key)
        return True
