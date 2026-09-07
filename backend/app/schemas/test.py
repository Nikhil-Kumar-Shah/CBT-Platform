import uuid
from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict, Field
from backend.app.schemas.question import QuestionResponse, OptionCreate


class TestQuestionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    test_id: uuid.UUID
    question_id: uuid.UUID
    order_index: int
    marks: Optional[float] = None
    negative_marks: Optional[float] = None
    question: Optional[QuestionResponse] = None


class TestQuestionSyncItem(BaseModel):
    question_id: uuid.UUID
    order_index: int
    marks: Optional[float] = None
    negative_marks: Optional[float] = None


class TestQuestionSyncRequest(BaseModel):
    questions: List[TestQuestionSyncItem]


class InlineQuestionCreate(BaseModel):
    question_type: str = Field(
        ...,
        pattern="^(MCQ|MULTIPLE_CHOICE|NUMERICAL|TRUE_FALSE|ASSERTION_REASON|MATCH_THE_FOLLOWING|FILL_BLANK)$",
    )
    difficulty: str = Field("MEDIUM", pattern="^(EASY|MEDIUM|HARD)$")
    content: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    hint: Optional[str] = None
    marks: Optional[float] = None
    negative_marks: Optional[float] = None
    numerical_answer: Optional[float] = None
    numerical_tolerance: Optional[float] = 0.0
    options: Optional[List[OptionCreate]] = None
    media_ids: Optional[List[uuid.UUID]] = None


class BatchInlineQuestionCreate(BaseModel):
    questions: List[InlineQuestionCreate] = Field(..., min_length=1)


class TestCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    code: Optional[str] = Field(
        None,
        min_length=6,
        max_length=6,
        pattern=r"^[A-Z0-9]{6}$",
        description="Exactly 6-character uppercase alphanumeric access code (e.g. KP4B2X)",
    )
    description: Optional[str] = None
    instructions: Optional[str] = None
    topics_covered: Optional[str] = None
    test_series_id: Optional[uuid.UUID] = None
    subject_id: Optional[uuid.UUID] = None
    duration_minutes: int = Field(60, ge=1, le=1440)
    positive_marks: float = Field(4.0, ge=0.0)
    negative_marks: float = Field(1.0, ge=0.0)
    question_order: str = Field("FIXED", pattern="^(FIXED|RANDOM)$")
    option_order: str = Field("FIXED", pattern="^(FIXED|RANDOM)$")
    result_visibility: str = Field("IMMEDIATELY", pattern="^(IMMEDIATELY|HIDDEN|SCHEDULED)$")
    show_answers: bool = True
    show_explanation: bool = True
    allow_resume: bool = True
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    question_ids: Optional[List[uuid.UUID]] = None


class TestUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    code: Optional[str] = Field(
        None,
        min_length=6,
        max_length=6,
        pattern=r"^[A-Z0-9]{6}$",
        description="Exactly 6-character uppercase alphanumeric access code (e.g. KP4B2X)",
    )
    description: Optional[str] = None
    instructions: Optional[str] = None
    topics_covered: Optional[str] = None
    test_series_id: Optional[uuid.UUID] = None
    series_order: Optional[int] = None
    subject_id: Optional[uuid.UUID] = None
    duration_minutes: Optional[int] = Field(None, ge=1, le=1440)
    status: Optional[str] = Field(None, pattern="^(DRAFT|SCHEDULED|LIVE|PAUSED|COMPLETED|CANCELLED|ARCHIVED|PUBLISHED|CLOSED)$")
    positive_marks: Optional[float] = Field(None, ge=0.0)
    negative_marks: Optional[float] = Field(None, ge=0.0)
    question_order: Optional[str] = Field(None, pattern="^(FIXED|RANDOM)$")
    option_order: Optional[str] = Field(None, pattern="^(FIXED|RANDOM)$")
    result_visibility: Optional[str] = Field(None, pattern="^(IMMEDIATELY|HIDDEN|SCHEDULED)$")
    show_answers: Optional[bool] = None
    show_explanation: Optional[bool] = None
    allow_resume: Optional[bool] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class TestRescheduleRequest(BaseModel):
    start_time: datetime
    end_time: Optional[datetime] = None


class TestCancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=1000)


class TestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    code: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    topics_covered: Optional[str] = None
    test_series_id: Optional[uuid.UUID] = None
    test_series_name: Optional[str] = None
    series_order: Optional[int] = 1
    subject_id: Optional[uuid.UUID] = None
    subject_name: Optional[str] = None
    duration_minutes: int
    status: str
    positive_marks: float
    negative_marks: float
    question_order: str
    option_order: str
    result_visibility: str
    show_answers: bool
    show_explanation: bool
    allow_resume: bool
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    published_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    question_count: int = 0
    total_marks: float = 0.0
    attempts_count: int = 0
    total_participants: int = 0
    total_submissions: int = 0
    active_candidates_count: int = 0
    difficulty_breakdown: Dict[str, int] = {}
    questions: List[TestQuestionItem] = []


class TestListResponse(BaseModel):
    items: List[TestResponse]
    total: int
    page: int
    page_size: int

