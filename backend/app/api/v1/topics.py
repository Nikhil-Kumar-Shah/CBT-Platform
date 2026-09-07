import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import require_admin
from backend.app.models.subject import Subject
from backend.app.models.topic import Topic
from backend.app.schemas.topic import TopicCreate, TopicUpdate, TopicResponse

router = APIRouter(prefix="/topics", tags=["Topics"])


@router.get("", response_model=List[TopicResponse], summary="List Topics")
def list_topics(
    subject_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(ACTIVE|ARCHIVED)$"),
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    stmt = select(Topic)
    if subject_id:
        stmt = stmt.where(Topic.subject_id == subject_id)
    if status_filter:
        stmt = stmt.where(Topic.status == status_filter)
    stmt = stmt.order_by(Topic.name)
    return db.scalars(stmt).all()


@router.post("", response_model=TopicResponse, status_code=status.HTTP_201_CREATED, summary="Create Topic")
def create_topic(
    payload: TopicCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    # Verify subject exists
    subject = db.get(Subject, payload.subject_id)
    if not subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject does not exist.")

    # Check unique constraint (subject_id, name)
    existing = db.scalar(
        select(Topic).where(
            Topic.subject_id == payload.subject_id,
            Topic.name.ilike(payload.name.strip()),
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Topic with name '{payload.name}' already exists under subject '{subject.name}'.",
        )

    topic = Topic(
        subject_id=payload.subject_id,
        name=payload.name.strip(),
        status="ACTIVE",
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.patch("/{topic_id}", response_model=TopicResponse, summary="Update Topic")
def update_topic(
    topic_id: uuid.UUID,
    payload: TopicUpdate,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found.")

    if payload.subject_id is not None:
        subject = db.get(Subject, payload.subject_id)
        if not subject:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject does not exist.")
        topic.subject_id = payload.subject_id

    if payload.name is not None:
        topic.name = payload.name.strip()

    if payload.status is not None:
        topic.status = payload.status

    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Archive Topic")
def archive_topic(
    topic_id: uuid.UUID,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found.")

    topic.status = "ARCHIVED"
    db.commit()
    return None
