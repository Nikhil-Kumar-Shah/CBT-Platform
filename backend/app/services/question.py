import uuid
import math
from typing import List, Optional, Tuple
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status

from backend.app.models.subject import Subject
from backend.app.models.topic import Topic
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.question_media import QuestionMedia
from backend.app.schemas.question import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    QuestionListResponse,
    OptionResponse,
)
from backend.app.services.media import MediaService
from backend.app.core.logging import logger


class QuestionService:
    @staticmethod
    def validate_question_data(
        db: Session,
        question_type: str,
        subject_id: uuid.UUID,
        topic_id: Optional[uuid.UUID],
        numerical_answer: Optional[float],
        options: Optional[list],
        marks: Optional[float] = None,
        negative_marks: Optional[float] = None,
    ) -> None:
        """Strict server-side validation of question data and domain relationships."""
        # 1. Subject validation
        subject = db.get(Subject, subject_id)
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject with ID '{subject_id}' does not exist.",
            )
        if subject.status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add question to inactive subject '{subject.name}'.",
            )

        # 2. Topic validation (if topic provided)
        if topic_id is not None:
            topic = db.get(Topic, topic_id)
            if not topic:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Topic with ID '{topic_id}' does not exist.",
                )
            if topic.subject_id != subject_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Topic '{topic.name}' does not belong to subject '{subject.name}'.",
                )
            if topic.status != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot add question to inactive topic '{topic.name}'.",
                )

        # 3. Marks validation
        if marks is not None and marks < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Marks cannot be negative.",
            )
        if negative_marks is not None and negative_marks < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Negative marks cannot be negative.",
            )

        # 4. Single-choice option-based validation (MCQ, TRUE_FALSE, ASSERTION_REASON, MATCH_THE_FOLLOWING)
        if question_type in ("MCQ", "TRUE_FALSE", "ASSERTION_REASON", "MATCH_THE_FOLLOWING"):
            if not options or len(options) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{question_type} questions must have at least 2 options.",
                )
            if len(options) > 10:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{question_type} questions cannot have more than 10 options.",
                )

            correct_count = sum(1 for opt in options if (opt.is_correct if hasattr(opt, "is_correct") else opt.get("is_correct", False)))
            if correct_count != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{question_type} questions must have exactly 1 correct option. Found {correct_count}.",
                )

            orders = [opt.option_order if hasattr(opt, "option_order") else opt.get("option_order") for opt in options]
            if len(set(orders)) != len(orders):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Option orders must be unique.",
                )

        elif question_type == "MULTIPLE_CHOICE":
            if not options or len(options) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Multiple-choice questions must have at least 2 options.",
                )
            correct_count = sum(1 for opt in options if (opt.is_correct if hasattr(opt, "is_correct") else opt.get("is_correct", False)))
            if correct_count < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Multiple-choice questions must have at least 1 correct option.",
                )
            orders = [opt.option_order if hasattr(opt, "option_order") else opt.get("option_order") for opt in options]
            if len(set(orders)) != len(orders):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Option orders must be unique.",
                )

        # 5. Numerical structure validation
        elif question_type == "NUMERICAL":
            if numerical_answer is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Numerical questions must have a correct numerical answer.",
                )
            if options and len(options) > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Numerical questions cannot have options.",
                )

        # 6. Fill in the blank validation
        elif question_type == "FILL_BLANK":
            if numerical_answer is None and (not options or len(options) == 0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="FILL_BLANK questions must specify a valid answer or text value.",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid question type '{question_type}'.",
            )

    @staticmethod
    def create_question(
        db: Session,
        payload: QuestionCreate,
        user_id: Optional[uuid.UUID] = None,
        auto_commit: bool = True,
    ):
        QuestionService.validate_question_data(
            db=db,
            question_type=payload.question_type,
            subject_id=payload.subject_id,
            topic_id=payload.topic_id,
            numerical_answer=payload.numerical_answer,
            options=payload.options,
            marks=payload.marks,
            negative_marks=payload.negative_marks,
        )

        is_num_type = payload.question_type in ("NUMERICAL", "FILL_BLANK")
        question = Question(
            question_type=payload.question_type,
            subject_id=payload.subject_id,
            topic_id=payload.topic_id,
            difficulty=payload.difficulty,
            content=payload.content,
            explanation=payload.explanation,
            hint=payload.hint,
            marks=payload.marks,
            negative_marks=payload.negative_marks,
            numerical_answer=payload.numerical_answer if is_num_type else None,
            numerical_tolerance=payload.numerical_tolerance if is_num_type else None,
            status="ACTIVE",
            created_by=user_id,
        )
        db.add(question)
        db.flush()

        # Add options if option-based or text-based question with acceptable answers
        if payload.question_type != "NUMERICAL" and payload.options:
            for opt in payload.options:
                option = QuestionOption(
                    question_id=question.id,
                    option_order=opt.option_order,
                    content=opt.content,
                    is_correct=opt.is_correct,
                )
                db.add(option)
            db.flush()

        # Associate media if provided
        if payload.media_ids:
            for idx, m_id in enumerate(payload.media_ids):
                media = db.get(QuestionMedia, m_id)
                if media:
                    media.question_id = question.id
                    media.display_order = idx
            db.flush()

        if not auto_commit:
            return question

        db.commit()
        db.expire_all()
        return QuestionService.get_question_response(db, question.id)

    @staticmethod
    def update_question(
        db: Session,
        question_id: uuid.UUID,
        payload: QuestionUpdate,
        auto_commit: bool = True,
    ):
        question = db.get(Question, question_id)
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Question with ID '{question_id}' not found.",
            )

        # Effective values for validation
        new_type = payload.question_type or question.question_type
        new_subject_id = payload.subject_id or question.subject_id
        new_topic_id = payload.topic_id if payload.topic_id is not None else question.topic_id
        new_num_ans = payload.numerical_answer if payload.numerical_answer is not None else question.numerical_answer
        new_options = payload.options if payload.options is not None else (
            [{"option_order": o.option_order, "content": o.content, "is_correct": o.is_correct} for o in question.options]
            if new_type != "NUMERICAL" else None
        )

        QuestionService.validate_question_data(
            db=db,
            question_type=new_type,
            subject_id=new_subject_id,
            topic_id=new_topic_id,
            numerical_answer=new_num_ans,
            options=new_options,
            marks=payload.marks if payload.marks is not None else question.marks,
            negative_marks=payload.negative_marks if payload.negative_marks is not None else question.negative_marks,
        )

        # Update scalar fields
        if payload.question_type is not None:
            question.question_type = payload.question_type
        if payload.subject_id is not None:
            question.subject_id = payload.subject_id
        if payload.topic_id is not None:
            question.topic_id = payload.topic_id
        if payload.difficulty is not None:
            question.difficulty = payload.difficulty
        if payload.content is not None:
            question.content = payload.content
        if payload.explanation is not None:
            question.explanation = payload.explanation.strip() if payload.explanation else None
        if payload.hint is not None:
            question.hint = payload.hint.strip() if payload.hint else None
        if payload.marks is not None:
            question.marks = payload.marks
        if payload.negative_marks is not None:
            question.negative_marks = payload.negative_marks
        if payload.numerical_answer is not None:
            question.numerical_answer = payload.numerical_answer
        if payload.numerical_tolerance is not None:
            question.numerical_tolerance = payload.numerical_tolerance
        if payload.status is not None:
            question.status = payload.status

        # If switching or updating options
        if payload.options is not None:
            # Delete old options
            for old_opt in list(question.options):
                db.delete(old_opt)
            db.flush()

            if question.question_type != "NUMERICAL":
                for opt in payload.options:
                    db.add(QuestionOption(
                        question_id=question.id,
                        option_order=opt.option_order,
                        content=opt.content,
                        is_correct=opt.is_correct,
                    ))
                db.flush()

        # If media IDs provided, re-associate
        if payload.media_ids is not None:
            # Reset existing media references
            for m in question.media:
                m.question_id = None
            db.flush()

            for idx, m_id in enumerate(payload.media_ids):
                media = db.get(QuestionMedia, m_id)
                if media:
                    media.question_id = question.id
                    media.display_order = idx
            db.flush()

        if not auto_commit:
            return question

        db.commit()
        db.expire_all()
        return QuestionService.get_question_response(db, question.id)

    @staticmethod
    def archive_question(db: Session, question_id: uuid.UUID) -> bool:
        """Archive a question rather than physically deleting it."""
        question = db.get(Question, question_id)
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Question with ID '{question_id}' not found.",
            )
        question.status = "ARCHIVED"
        db.commit()
        logger.info("Archived question_id=%s", question_id)
        return True

    @staticmethod
    def get_question_response(db: Session, question_id: uuid.UUID) -> QuestionResponse:
        stmt = (
            select(Question)
            .options(
                selectinload(Question.options),
                selectinload(Question.media),
                selectinload(Question.subject),
                selectinload(Question.topic),
            )
            .where(Question.id == question_id)
        )
        question = db.scalar(stmt)
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Question with ID '{question_id}' not found.",
            )

        media_responses = [MediaService.get_media_response(m) for m in question.media]
        options_responses = [
            OptionResponse(
                id=o.id,
                question_id=o.question_id,
                option_order=o.option_order,
                content=o.content,
                is_correct=o.is_correct,
            )
            for o in sorted(question.options, key=lambda x: x.option_order)
        ]

        return QuestionResponse(
            id=question.id,
            question_type=question.question_type,
            subject_id=question.subject_id,
            topic_id=question.topic_id,
            difficulty=question.difficulty,
            content=question.content,
            explanation=question.explanation,
            hint=question.hint,
            marks=float(question.marks),
            negative_marks=float(question.negative_marks),
            numerical_answer=float(question.numerical_answer) if question.numerical_answer is not None else None,
            numerical_tolerance=float(question.numerical_tolerance) if question.numerical_tolerance is not None else None,
            status=question.status,
            created_by=question.created_by,
            created_at=question.created_at,
            updated_at=question.updated_at,
            options=options_responses,
            media=media_responses,
            subject_name=question.subject.name if question.subject else None,
            subject_code=question.subject.code if question.subject else None,
            topic_name=question.topic.name if question.topic else None,
        )

    @staticmethod
    def list_questions(
        db: Session,
        search: Optional[str] = None,
        subject_id: Optional[uuid.UUID] = None,
        topic_id: Optional[uuid.UUID] = None,
        question_type: Optional[str] = None,
        difficulty: Optional[str] = None,
        status_filter: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> QuestionListResponse:
        query = select(Question).options(
            selectinload(Question.options),
            selectinload(Question.media),
            selectinload(Question.subject),
            selectinload(Question.topic),
        )

        conditions = []
        if search and search.strip():
            conditions.append(Question.content.ilike(f"%{search.strip()}%"))
        if subject_id:
            conditions.append(Question.subject_id == subject_id)
        if topic_id:
            conditions.append(Question.topic_id == topic_id)
        if question_type:
            conditions.append(Question.question_type == question_type)
        if difficulty:
            conditions.append(Question.difficulty == difficulty)
        if status_filter:
            conditions.append(Question.status == status_filter)

        if conditions:
            query = query.where(and_(*conditions))

        # Count total
        count_stmt = select(func.count(Question.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = db.scalar(count_stmt) or 0

        # Pagination and order
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size

        query = query.order_by(Question.created_at.desc()).offset(offset).limit(page_size)
        questions = db.scalars(query).all()

        items = []
        for q in questions:
            media_responses = [MediaService.get_media_response(m) for m in q.media]
            options_responses = [
                OptionResponse(
                    id=o.id,
                    question_id=o.question_id,
                    option_order=o.option_order,
                    content=o.content,
                    is_correct=o.is_correct,
                )
                for o in sorted(q.options, key=lambda x: x.option_order)
            ]
            items.append(
                QuestionResponse(
                    id=q.id,
                    question_type=q.question_type,
                    subject_id=q.subject_id,
                    topic_id=q.topic_id,
                    difficulty=q.difficulty,
                    content=q.content,
                    explanation=q.explanation,
                    marks=float(q.marks),
                    negative_marks=float(q.negative_marks),
                    numerical_answer=float(q.numerical_answer) if q.numerical_answer is not None else None,
                    numerical_tolerance=float(q.numerical_tolerance) if q.numerical_tolerance is not None else None,
                    status=q.status,
                    created_by=q.created_by,
                    created_at=q.created_at,
                    updated_at=q.updated_at,
                    options=options_responses,
                    media=media_responses,
                    subject_name=q.subject.name if q.subject else None,
                    subject_code=q.subject.code if q.subject else None,
                    topic_name=q.topic.name if q.topic else None,
                )
            )

        total_pages = math.ceil(total / page_size) if total > 0 else 1

        return QuestionListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
