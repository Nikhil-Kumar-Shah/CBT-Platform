import uuid
from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict, Field, model_validator


class AccessCodeVerifyRequest(BaseModel):
    access_code: Optional[str] = Field(None, max_length=100)
    code: Optional[str] = Field(None, max_length=100)


class AccessCodeVerifyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    test_id: uuid.UUID
    title: str
    code: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    topics_covered: Optional[str] = None
    subject_name: Optional[str] = None
    duration_minutes: int
    positive_marks: float
    negative_marks: float
    total_questions: int
    total_marks: float
    allow_resume: bool
    result_visibility: str
    status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    server_time: Optional[datetime] = None
    server_now: Optional[datetime] = None
    is_lobby_open: bool = False
    starts_in_seconds: int = 0
    can_start: bool = True


class AttemptStartRequest(BaseModel):
    access_code: Optional[str] = Field(None, max_length=100)
    code: Optional[str] = Field(None, max_length=100)
    candidate_name: str = Field(..., min_length=1, max_length=150)
    candidate_email: Optional[str] = Field(None, max_length=255)
    candidate_phone: Optional[str] = Field(None, max_length=50)
    roll_number: Optional[str] = Field(None, max_length=50)
    client_session_id: Optional[str] = Field(None, max_length=64)


class AttemptQuestionOptionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    option_order: int
    content: str


class AttemptQuestionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_index: int
    question_type: str
    content: str
    image_url: Optional[str] = None
    marks: float
    negative_marks: float
    options: List[AttemptQuestionOptionItem] = []


class AttemptAnswerItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: uuid.UUID
    selected_option_ids: Optional[str] = None
    selected_option_id: Optional[str] = None
    numerical_answer: Optional[float] = None
    text_answer: Optional[str] = None
    is_marked_for_review: bool = False
    is_visited: bool = True
    answered_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def harmonize_before(cls, data):
        if isinstance(data, dict):
            opt_id = data.get("selected_option_id")
            opt_ids = data.get("selected_option_ids")
            if opt_id and not opt_ids:
                data["selected_option_ids"] = str(opt_id)
            elif opt_ids and not opt_id:
                data["selected_option_id"] = str(opt_ids)
        return data

    @model_validator(mode="after")
    def harmonize_after(self):
        if self.selected_option_ids and not self.selected_option_id:
            self.selected_option_id = self.selected_option_ids
        elif self.selected_option_id and not self.selected_option_ids:
            self.selected_option_ids = self.selected_option_id
        return self


class AttemptSessionStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: uuid.UUID
    session_id: str
    status: str
    candidate_name: str
    candidate_email: Optional[str] = None
    candidate_phone: Optional[str] = None
    roll_number: Optional[str] = None
    started_at: datetime
    expires_at: datetime
    server_time: datetime
    server_now: Optional[datetime] = None
    time_remaining_seconds: int
    remaining_seconds: Optional[int] = None
    current_question_index: int
    is_paused: bool = False
    submission_reason: Optional[str] = None
    expired_at: Optional[datetime] = None
    test: AccessCodeVerifyResponse
    questions: List[AttemptQuestionItem]
    answers: Dict[str, AttemptAnswerItem] = {}
    marked_for_review: List[str] = []


class AttemptSaveAnswerRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    question_id: uuid.UUID
    selected_option_ids: Optional[str] = None
    selected_option_id: Optional[str] = None
    numerical_answer: Optional[float] = None
    text_answer: Optional[str] = None
    is_marked_for_review: Optional[bool] = None
    current_question_index: Optional[int] = None
    client_timestamp: Optional[datetime] = None
    version: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def harmonize_options(cls, data):
        if isinstance(data, dict):
            opt_id = data.get("selected_option_id")
            opt_ids = data.get("selected_option_ids")
            if opt_id and not opt_ids:
                data["selected_option_ids"] = str(opt_id)
            elif opt_ids and not opt_id:
                data["selected_option_id"] = str(opt_ids)
        return data

    @model_validator(mode="after")
    def harmonize_after(self):
        if self.selected_option_ids and not self.selected_option_id:
            self.selected_option_id = self.selected_option_ids
        elif self.selected_option_id and not self.selected_option_ids:
            self.selected_option_ids = self.selected_option_id
        return self


class AttemptSaveAnswerResponse(BaseModel):
    status: str = "SAVED"
    saved_at: datetime
    server_time: Optional[datetime] = None
    server_now: Optional[datetime] = None
    time_remaining_seconds: int
    remaining_seconds: Optional[int] = None
    is_marked_for_review: bool = False
    is_expired: bool = False
    is_paused: bool = False


class AttemptHeartbeatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    current_question_index: Optional[int] = None
    time_spent_delta_seconds: Optional[int] = None


class AttemptHeartbeatResponse(BaseModel):
    status: str
    is_active: bool
    is_expired: bool
    is_paused: bool = False
    submission_reason: Optional[str] = None
    server_time: datetime
    server_now: Optional[datetime] = None
    time_remaining_seconds: int
    remaining_seconds: Optional[int] = None


class AttemptSubmitRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    is_auto_submit: bool = False
    forced_by_expiry: Optional[bool] = False
    final_answers: Optional[List[AttemptSaveAnswerRequest]] = None


class AttemptOptionResultItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    option_order: int
    content: str
    is_correct: Optional[bool] = None
    is_selected: bool = False


class AttemptQuestionResultItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: uuid.UUID
    order_index: int
    question_content: str
    question_type: str
    options: List[AttemptOptionResultItem] = []
    candidate_answer: Optional[str] = None
    correct_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    marks_awarded: float
    max_marks: float
    negative_marks: float
    explanation: Optional[str] = None


class AttemptResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: uuid.UUID
    status: str
    submission_reason: Optional[str] = None
    is_auto_expired: bool = False
    student_name: str
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_phone: Optional[str] = None
    roll_number: Optional[str] = None
    test_title: str
    test_code: str
    submitted_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    time_taken_seconds: int
    result_visibility: str
    show_results: bool
    show_answers: bool = True
    show_explanation: bool = True
    total_questions: int = 0
    answered_count: int = 0
    unanswered_count: int = 0
    score: Optional[float] = None
    total_marks: Optional[float] = None
    percentage: Optional[float] = None
    accuracy: Optional[float] = None
    correct_count: Optional[int] = None
    incorrect_count: Optional[int] = None
    unattempted_count: Optional[int] = None
    answers: Optional[List[AttemptQuestionResultItem]] = None
    message: str
