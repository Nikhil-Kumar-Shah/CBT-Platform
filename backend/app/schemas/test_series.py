import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class TestSeriesCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str = Field(default="DRAFT", pattern="^(DRAFT|PUBLISHED|ARCHIVED)$")


class TestSeriesUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(DRAFT|PUBLISHED|ARCHIVED)$")


class TestSummaryInSeries(BaseModel):
    id: uuid.UUID
    title: str
    code: str
    duration_minutes: int
    status: str
    series_order: Optional[int] = 1
    subject_name: Optional[str] = None
    total_marks: float = 0.0
    question_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class TestSeriesReorderRequest(BaseModel):
    test_ids: List[uuid.UUID]


class TestSeriesResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    test_count: int = 0
    published_test_count: int = 0
    total_attempts: int = 0
    tests: List[TestSummaryInSeries] = []

    model_config = {"from_attributes": True}


class TestSeriesListResponse(BaseModel):
    items: List[TestSeriesResponse]
    total: int
    page: int
    page_size: int
