import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.app.schemas.media import MediaResponse


class OptionCreate(BaseModel):
    option_order: int = Field(..., ge=1, le=20)
    content: str = Field(..., min_length=1)
    is_correct: bool = False


class OptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_id: uuid.UUID
    option_order: int
    content: str
    is_correct: bool


class QuestionCreate(BaseModel):
    question_type: str = Field(
        ...,
        pattern="^(MCQ|MULTIPLE_CHOICE|NUMERICAL|TRUE_FALSE|ASSERTION_REASON|MATCH_THE_FOLLOWING|FILL_BLANK)$",
    )
    subject_id: uuid.UUID
    topic_id: Optional[uuid.UUID] = None
    difficulty: str = Field("MEDIUM", pattern="^(EASY|MEDIUM|HARD)$")
    content: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    hint: Optional[str] = None
    marks: float = Field(4.0, ge=0.0, le=100.0)
    negative_marks: float = Field(1.0, ge=0.0, le=100.0)
    numerical_answer: Optional[float] = None
    numerical_tolerance: Optional[float] = Field(0.0, ge=0.0)
    options: Optional[List[OptionCreate]] = None
    media_ids: Optional[List[uuid.UUID]] = None


class QuestionUpdate(BaseModel):
    question_type: Optional[str] = Field(
        None,
        pattern="^(MCQ|MULTIPLE_CHOICE|NUMERICAL|TRUE_FALSE|ASSERTION_REASON|MATCH_THE_FOLLOWING|FILL_BLANK)$",
    )
    subject_id: Optional[uuid.UUID] = None
    topic_id: Optional[uuid.UUID] = None
    difficulty: Optional[str] = Field(None, pattern="^(EASY|MEDIUM|HARD)$")
    content: Optional[str] = Field(None, min_length=1)
    explanation: Optional[str] = None
    hint: Optional[str] = None
    marks: Optional[float] = Field(None, ge=0.0, le=100.0)
    negative_marks: Optional[float] = Field(None, ge=0.0, le=100.0)
    numerical_answer: Optional[float] = None
    numerical_tolerance: Optional[float] = Field(None, ge=0.0)
    status: Optional[str] = Field(None, pattern="^(ACTIVE|ARCHIVED)$")
    options: Optional[List[OptionCreate]] = None
    media_ids: Optional[List[uuid.UUID]] = None


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_type: str
    subject_id: uuid.UUID
    topic_id: Optional[uuid.UUID] = None
    difficulty: str
    content: str
    explanation: Optional[str] = None
    hint: Optional[str] = None
    marks: float
    negative_marks: float
    numerical_answer: Optional[float] = None
    numerical_tolerance: Optional[float] = None
    status: str
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    options: List[OptionResponse] = []
    media: List[MediaResponse] = []
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    topic_name: Optional[str] = None


class QuestionListResponse(BaseModel):
    items: List[QuestionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
