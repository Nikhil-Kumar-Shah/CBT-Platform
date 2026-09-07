import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TopicBase(BaseModel):
    subject_id: uuid.UUID
    name: str = Field(..., min_length=2, max_length=150)


class TopicCreate(TopicBase):
    pass


class TopicUpdate(BaseModel):
    subject_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    status: Optional[str] = Field(None, pattern="^(ACTIVE|ARCHIVED)$")


class TopicResponse(TopicBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime
