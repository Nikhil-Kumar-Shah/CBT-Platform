import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import require_admin
from backend.app.schemas.question import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    QuestionListResponse,
)
from backend.app.services.question import QuestionService
from backend.app.services.audit_service import AuditService

router = APIRouter(prefix="/questions", tags=["Questions"])


@router.get("", response_model=QuestionListResponse, summary="List Questions")
def list_questions(
    search: Optional[str] = Query(None, description="Search keyword in question content"),
    subject_id: Optional[uuid.UUID] = Query(None, description="Filter by Subject ID"),
    topic_id: Optional[uuid.UUID] = Query(None, description="Filter by Topic ID"),
    question_type: Optional[str] = Query(None, pattern="^(MCQ|NUMERICAL)$", description="Filter by Question Type"),
    difficulty: Optional[str] = Query(None, pattern="^(EASY|MEDIUM|HARD)$", description="Filter by Difficulty"),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(ACTIVE|ARCHIVED)$", description="Filter by Status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    return QuestionService.list_questions(
        db=db,
        search=search,
        subject_id=subject_id,
        topic_id=topic_id,
        question_type=question_type,
        difficulty=difficulty,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED, summary="Create Question")
def create_question(
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    result = QuestionService.create_question(
        db=db,
        payload=payload,
        user_id=admin.id,
    )
    try:
        AuditService.log(
            db=db,
            event_type="QUESTION_CREATED",
            category="QUESTIONS",
            severity="INFO",
            actor=admin.username,
            actor_type="ADMIN",
            action="CREATE",
            resource_type="QUESTION",
            resource_id=str(result.id),
            description=f"Created question in {payload.question_type or 'MCQ'} ({payload.difficulty or 'MEDIUM'})",
            details={"difficulty": payload.difficulty, "question_type": payload.question_type},
        )
    except Exception:
        pass
    return result


@router.get("/{question_id}", response_model=QuestionResponse, summary="Get Question by ID")
def get_question(
    question_id: uuid.UUID,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    return QuestionService.get_question_response(db, question_id)


@router.patch("/{question_id}", response_model=QuestionResponse, summary="Update Question")
def update_question(
    question_id: uuid.UUID,
    payload: QuestionUpdate,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    result = QuestionService.update_question(
        db=db,
        question_id=question_id,
        payload=payload,
    )
    try:
        AuditService.log(
            db=db,
            event_type="QUESTION_EDITED",
            category="QUESTIONS",
            severity="INFO",
            actor=_user.username,
            actor_type="ADMIN",
            action="UPDATE",
            resource_type="QUESTION",
            resource_id=str(question_id),
            description=f"Updated question details",
        )
    except Exception:
        pass
    return result


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Archive Question")
def archive_question(
    question_id: uuid.UUID,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    """Archive question rather than deleting physically, preserving exam history."""
    QuestionService.archive_question(db, question_id)
    try:
        AuditService.log(
            db=db,
            event_type="QUESTION_DELETED",
            category="QUESTIONS",
            severity="WARNING",
            actor=_user.username,
            actor_type="ADMIN",
            action="ARCHIVE",
            resource_type="QUESTION",
            resource_id=str(question_id),
            description="Archived question from question bank",
        )
    except Exception:
        pass
    return None
