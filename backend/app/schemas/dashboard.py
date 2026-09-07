import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class RecentTestItem(BaseModel):
    id: uuid.UUID
    title: str
    code: str
    series_name: Optional[str] = None
    status: str
    question_count: int
    attempts_count: int = 0
    created_at: datetime


class RecentActivityItem(BaseModel):
    id: str
    type: str  # TEST_PUBLISHED, TEST_CREATED, QUESTION_ADDED, etc.
    title: str
    description: str
    timestamp: datetime


class DashboardStatsResponse(BaseModel):
    total_tests: int
    published_tests: int
    draft_tests: int
    closed_tests: int
    total_attempts: int
    total_questions: int
    total_series: int
    live_tests: int = 0
    scheduled_tests: int = 0
    completed_tests: int = 0
    total_candidates: int = 0
    total_submissions: int = 0
    needs_attention: int = 0
    recent_tests: List[RecentTestItem]
    recent_activity: List[RecentActivityItem]
