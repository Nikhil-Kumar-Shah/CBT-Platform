import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SubjectBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(
        ...,
        description="Subject code (e.g. PHY001, MATH01)",
    )


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: Optional[str] = Field(
        None,
        min_length=6,
        max_length=6,
        pattern=r"^[A-Z0-9]{6}$",
        description="Optional 6-character uppercase subject code. If omitted, automatically generated from subject name.",
    )


class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    code: Optional[str] = Field(
        None,
        min_length=6,
        max_length=6,
        pattern=r"^[A-Z0-9]{6}$",
        description="Optional 6-character uppercase subject code",
    )
    status: Optional[str] = Field(None, pattern="^(ACTIVE|ARCHIVED)$")


class SubjectResponse(SubjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    status: str
    created_at: datetime
    updated_at: datetime
