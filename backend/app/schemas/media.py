import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class MediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_id: Optional[uuid.UUID] = None
    storage_key: str
    url: str
    original_filename: str
    mime_type: str
    file_size: int
    width: int
    height: int
    display_order: int
    created_at: datetime
