import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import require_admin
from backend.app.models.subject import Subject
from backend.app.schemas.subject import SubjectCreate, SubjectUpdate, SubjectResponse

router = APIRouter(prefix="/subjects", tags=["Subjects"])


import time
from typing import List, Optional, Dict, Tuple

_SUBJECTS_CACHE: Dict[Optional[str], Tuple[float, List[SubjectResponse]]] = {}
_SUBJECTS_CACHE_TTL: float = 60.0

def invalidate_subjects_cache():
    _SUBJECTS_CACHE.clear()


@router.get("", response_model=List[SubjectResponse], summary="List Subjects")
def list_subjects(
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(ACTIVE|ARCHIVED)$"),
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    now_ts = time.time()
    if status_filter in _SUBJECTS_CACHE:
        cached_time, cached_res = _SUBJECTS_CACHE[status_filter]
        if now_ts - cached_time < _SUBJECTS_CACHE_TTL:
            return cached_res

    stmt = select(Subject)
    if status_filter:
        stmt = stmt.where(Subject.status == status_filter)
    stmt = stmt.order_by(Subject.name)
    items = db.scalars(stmt).all()
    res = [SubjectResponse.model_validate(s) for s in items]
    _SUBJECTS_CACHE[status_filter] = (now_ts, res)
    return res


def _generate_subject_code(name: str, db: Session) -> str:
    """Generates a clean uppercase code prefix like MATH01, PHYS01 from subject name."""
    import re
    cleaned = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    prefix = cleaned[:4] if len(cleaned) >= 4 else (cleaned + "SUBJ")[:4]
    for i in range(1, 100):
        code = f"{prefix}{i:02d}"
        exists = db.scalar(select(Subject).where(Subject.code == code))
        if not exists:
            return code
    return f"{prefix}{uuid.uuid4().hex[:4].upper()}"


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED, summary="Create Subject")
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    name = payload.name.strip()
    code = payload.code.strip().upper() if payload.code else _generate_subject_code(name, db)

    # Check duplicate name or code
    existing_name = db.scalar(select(Subject).where(Subject.name.ilike(name)))
    if existing_name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Subject with name '{name}' already exists.",
        )

    existing_code = db.scalar(select(Subject).where(Subject.code == code))
    if existing_code:
        code = _generate_subject_code(name, db)

    subject = Subject(
        name=name,
        code=code,
        status="ACTIVE",
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    invalidate_subjects_cache()
    return subject


@router.patch("/{subject_id}", response_model=SubjectResponse, summary="Update Subject")
def update_subject(
    subject_id: uuid.UUID,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")

    if payload.name is not None:
        subject.name = payload.name.strip()
    if payload.code is not None:
        subject.code = payload.code.strip().upper()
    if payload.status is not None:
        subject.status = payload.status

    db.commit()
    db.refresh(subject)
    invalidate_subjects_cache()
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete Subject")
def delete_subject(
    subject_id: uuid.UUID,
    permanent: bool = Query(True, description="Whether to permanently remove subject if unreferenced"),
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")

    from backend.app.models.question import Question
    from backend.app.models.test import Test
    from sqlalchemy import func, update

    question_count = db.scalar(select(func.count(Question.id)).where(Question.subject_id == subject_id)) or 0

    if permanent:
        if question_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete subject '{subject.name}': {question_count} questions are assigned to it. Reassign or delete questions first.",
            )
        # Clear test subject_id references so tests remain intact without broken reference
        db.execute(update(Test).where(Test.subject_id == subject_id).values(subject_id=None))
        db.delete(subject)
        db.commit()
    else:
        subject.status = "ARCHIVED"
        db.commit()

    invalidate_subjects_cache()
    return None
