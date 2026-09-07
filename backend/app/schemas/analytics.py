import uuid
from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, ConfigDict


class ScoreDistributionBucket(BaseModel):
    range_label: str  # e.g., "0-20%", "20-40%", "40-60%", "60-80%", "80-100%"
    count: int
    percentage: float


class OptionDistributionItem(BaseModel):
    option_id: str
    option_label: str  # e.g., "A", "B", "C", "D"
    content_preview: str
    selection_count: int
    selection_percentage: float
    is_correct: bool = False


class QuestionPerformanceItem(BaseModel):
    question_id: uuid.UUID
    order_index: int
    question_type: str
    preview: str
    max_marks: float = 0.0
    attempted_count: int = 0
    correct_count: int = 0
    incorrect_count: int = 0
    unattempted_count: int = 0
    correct_percentage: float = 0.0
    incorrect_percentage: float = 0.0
    unattempted_percentage: float = 0.0
    accuracy_percentage: float = 0.0
    total_attempts: int = 0
    average_marks: float = 0.0
    difficulty: str = "MODERATE"  # EASY, MODERATE, DIFFICULT
    is_easiest: bool = False
    is_most_difficult: bool = False
    option_distribution: Optional[List[OptionDistributionItem]] = None
    average_numerical_value: Optional[float] = None


from backend.app.schemas.integrity import IntegritySummaryResponse


class StudentSubmissionSummary(BaseModel):
    attempt_id: uuid.UUID
    rank: int
    student_name: str
    roll_number: Optional[str] = None
    score: float
    total_marks: float
    percentage: float
    accuracy: float = 0.0
    correct_count: int
    incorrect_count: int
    unattempted_count: int
    time_taken_seconds: int
    submitted_at: Optional[datetime] = None
    status: str = "SUBMITTED"  # SUBMITTED, IN_PROGRESS, COMPLETED
    review_recommended: Optional[bool] = False
    integrity_events_count: Optional[int] = 0


class StudentAnswerDetail(BaseModel):
    question_id: uuid.UUID
    order_index: int
    question_content: str
    question_type: str
    student_answer: Optional[str] = None
    correct_answer: str
    is_correct: bool
    status: str = "UNATTEMPTED"  # CORRECT, INCORRECT, UNATTEMPTED
    marks_awarded: float
    max_marks: float = 0.0
    explanation: Optional[str] = None


class StudentSubmissionDetail(BaseModel):
    attempt_id: uuid.UUID
    test_id: uuid.UUID
    test_title: str
    subject_name: Optional[str] = None
    student_name: str
    roll_number: Optional[str] = None
    score: float
    total_marks: float
    percentage: float
    accuracy: float = 0.0
    correct_count: int = 0
    incorrect_count: int = 0
    unattempted_count: int = 0
    time_taken_seconds: int
    submitted_at: Optional[datetime] = None
    answers: List[StudentAnswerDetail]
    integrity_summary: Optional[IntegritySummaryResponse] = None


class TestAnalyticsResponse(BaseModel):
    test_id: uuid.UUID
    test_title: str
    test_code: str
    subject_name: Optional[str] = None
    test_status: str = "COMPLETED"
    total_participants: int
    completed_submissions: int
    in_progress_count: int = 0
    not_started_count: int = 0
    expired_count: int = 0
    total_questions: int = 0
    total_marks: float = 0.0
    duration_minutes: int = 0
    average_score: float
    highest_score: float
    lowest_score: float
    median_score: float
    average_percentage: float
    average_accuracy: float = 0.0
    completion_rate: float
    submission_rate: float = 0.0
    average_time_seconds: int
    score_distribution: List[ScoreDistributionBucket]
    question_performance: List[QuestionPerformanceItem]
    easiest_questions: List[QuestionPerformanceItem]
    most_difficult_questions: List[QuestionPerformanceItem]
    student_submissions: List[StudentSubmissionSummary]

