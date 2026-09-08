import uuid
import secrets
import string
import time
from typing import List, Optional, Tuple, Dict
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session, selectinload, joinedload
from fastapi import HTTPException, status

VALID_TEST_TRANSITIONS = {
    "DRAFT": {"SCHEDULED", "LIVE", "CANCELLED", "ARCHIVED"},
    "SCHEDULED": {"LIVE", "DRAFT", "SCHEDULED", "CANCELLED", "ARCHIVED"},
    "LIVE": {"PAUSED", "COMPLETED", "CANCELLED"},
    "PUBLISHED": {"PAUSED", "COMPLETED", "CANCELLED"},
    "PAUSED": {"LIVE", "COMPLETED", "CANCELLED"},
    "COMPLETED": {"ARCHIVED"},
    "CLOSED": {"ARCHIVED"},
    "CANCELLED": {"ARCHIVED"},
    "ARCHIVED": {"DRAFT", "COMPLETED"},
}

from backend.app.models.user import User
from backend.app.models.test import Test
from backend.app.models.test_series import TestSeries
from backend.app.models.test_question import TestQuestion
from backend.app.models.test_audit_log import TestAuditLog
from backend.app.models.test_attempt import TestAttempt
from backend.app.models.subject import Subject
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.schemas.test import (
    TestCreate,
    TestUpdate,
    TestQuestionSyncItem,
    TestResponse,
    TestQuestionItem,
    InlineQuestionCreate,
)
from backend.app.schemas.test_audit import TestAuditLogResponse
from backend.app.schemas.question import QuestionResponse, QuestionCreate, QuestionUpdate
from backend.app.services.question import QuestionService
from backend.app.services.audit_service import AuditService
from backend.app.core.logging import logger

_LAST_TEST_RECONCILE_AT: float = 0.0


class TestService:
    @staticmethod
    def generate_access_code(db: Session, subject_code: Optional[str] = None) -> str:
        """Generate human-readable, collision-safe, exactly 6-character access code like KP4B2X."""
        charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
        for _ in range(50):
            code = "".join(secrets.choice(charset) for _ in range(6))
            exists = db.scalar(select(func.count(Test.id)).where(Test.code == code))
            if exists == 0:
                return code
        return uuid.uuid4().hex[:6].upper()
    @staticmethod
    def log_audit(
        db: Session,
        test_id: uuid.UUID,
        user_id: uuid.UUID,
        action: str,
        details: str,
        commit: bool = False,
    ):
        """Record an administrative audit log for a test and forward to Universal Audit Log."""
        log = TestAuditLog(
            test_id=test_id,
            user_id=user_id,
            action=action,
            details=details,
        )
        db.add(log)
        db.flush()

        # Forward to universal audit log
        try:
            user = db.get(User, user_id) if user_id else None
            actor_name = (user.display_name or user.username) if user else "Admin"
            category = "QUESTIONS" if "QUESTION" in action else "ADMIN"
            severity = "WARNING" if any(k in action for k in ("CANCEL", "ARCHIVE", "DELETE", "REMOVE")) else "INFO"
            
            AuditService.log(
                db=db,
                event_type=action,
                category=category,
                severity=severity,
                actor=actor_name,
                actor_type="ADMIN",
                action=action,
                resource_type="TEST",
                resource_id=str(test_id),
                description=details,
                commit=commit,
            )
        except Exception:
            pass

    @staticmethod
    def create_test(db: Session, data: TestCreate, user_id: uuid.UUID) -> Test:
        subject_code = None
        if data.subject_id:
            subject = db.scalar(select(Subject).where(Subject.id == data.subject_id))
            if not subject:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject not found.")
            subject_code = subject.code

        if data.test_series_id:
            series = db.scalar(select(TestSeries).where(TestSeries.id == data.test_series_id))
            if not series:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test series not found.")

        code = data.code.strip().upper() if data.code else TestService.generate_access_code(db, subject_code)
        if db.scalar(select(Test).where(Test.code == code)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Test with access code '{code}' already exists.",
            )

        test = Test(
            title=data.title.strip(),
            code=code,
            description=data.description.strip() if data.description else None,
            instructions=data.instructions.strip() if data.instructions else None,
            topics_covered=data.topics_covered.strip() if data.topics_covered else None,
            test_series_id=data.test_series_id,
            subject_id=data.subject_id,
            duration_minutes=data.duration_minutes,
            status="DRAFT",
            positive_marks=data.positive_marks,
            negative_marks=data.negative_marks,
            question_order=data.question_order,
            option_order=data.option_order,
            result_visibility=data.result_visibility,
            show_answers=data.show_answers,
            show_explanation=data.show_explanation,
            allow_resume=data.allow_resume,
            start_time=data.start_time,
            end_time=data.end_time,
            created_by=user_id,
        )
        db.add(test)
        db.flush()

        # Initial questions if passed
        if data.question_ids:
            for idx, q_id in enumerate(data.question_ids, start=1):
                tq = TestQuestion(
                    test_id=test.id,
                    question_id=q_id,
                    order_index=idx,
                    marks=data.positive_marks,
                    negative_marks=data.negative_marks,
                )
                db.add(tq)

        # Audit Log
        TestService.log_audit(
            db, test.id, user_id, "TEST_CREATED", f"Created examination paper '{test.title}' ({test.code})"
        )

        db.commit()
        return TestService.get_test(db, test.id)

    @staticmethod
    def get_test(db: Session, test_id: uuid.UUID) -> Test:
        test = db.scalar(
            select(Test)
            .options(
                joinedload(Test.test_series),
                joinedload(Test.subject),
                selectinload(Test.test_questions)
                .selectinload(TestQuestion.question)
                .selectinload(Question.options),
                selectinload(Test.test_questions)
                .selectinload(TestQuestion.question)
                .selectinload(Question.media),
                selectinload(Test.attempts),
            )
            .where(Test.id == test_id)
        )
        if not test:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found.")

        # Automatic lifecycle transition: if test is LIVE or SCHEDULED and end_time has passed, conclude it
        now = datetime.now(timezone.utc)
        if test.status in ("LIVE", "PUBLISHED", "SCHEDULED") and test.end_time:
            et = test.end_time.replace(tzinfo=timezone.utc) if test.end_time.tzinfo is None else test.end_time
            if now > et:
                test.status = "COMPLETED"
                for att in (test.attempts or []):
                    if att.status == "IN_PROGRESS":
                        from backend.app.services.attempt_service import AttemptService
                        AttemptService._evaluate_and_complete_attempt(
                            db, att, test, is_expired=True, submission_reason="AUTO_EXPIRED"
                        )
                TestService.log_audit(
                    db,
                    test.id,
                    test.created_by,
                    "AUTO_CONCLUDED",
                    f"Scheduled examination end time ({test.end_time.isoformat()}) reached. Automatically concluded.",
                )
                db.commit()
        elif test.status == "SCHEDULED" and test.start_time:
            st = test.start_time.replace(tzinfo=timezone.utc) if test.start_time.tzinfo is None else test.start_time
            if now >= st:
                test.status = "LIVE"
                db.commit()

        return test

    @staticmethod
    def list_tests(
        db: Session,
        status_filter: Optional[str] = None,
        series_id: Optional[uuid.UUID] = None,
        subject_id: Optional[uuid.UUID] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Test], int]:
        now = datetime.now(timezone.utc)

        global _LAST_TEST_RECONCILE_AT
        now_ts = time.time()
        if now_ts - _LAST_TEST_RECONCILE_AT > 30.0:
            _LAST_TEST_RECONCILE_AT = now_ts
            # Proactively reconcile any tests whose scheduled end_time has passed
            expired_tests = db.scalars(
                select(Test)
                .options(selectinload(Test.attempts))
                .where(
                    Test.status.in_(["LIVE", "PUBLISHED", "SCHEDULED"]),
                    Test.end_time.is_not(None),
                    Test.end_time < now,
                )
            ).all()
            if expired_tests:
                for exp_t in expired_tests:
                    exp_t.status = "COMPLETED"
                    for att in (exp_t.attempts or []):
                        if att.status == "IN_PROGRESS":
                            from backend.app.services.attempt_service import AttemptService
                            AttemptService._evaluate_and_complete_attempt(
                                db, att, exp_t, is_expired=True, submission_reason="AUTO_EXPIRED"
                            )
                db.commit()

            # Proactively reconcile SCHEDULED tests whose start_time has arrived
            live_scheduled = db.scalars(
                select(Test).where(
                    Test.status == "SCHEDULED",
                    Test.start_time.is_not(None),
                    Test.start_time <= now,
                    (Test.end_time.is_(None) | (Test.end_time >= now)),
                )
            ).all()
            if live_scheduled:
                for sch_t in live_scheduled:
                    sch_t.status = "LIVE"
                db.commit()

        query = select(Test).options(
            joinedload(Test.test_series),
            joinedload(Test.subject),
            selectinload(Test.test_questions).selectinload(TestQuestion.question),
            selectinload(Test.attempts),
        )

        if status_filter and status_filter != "ALL":
            if status_filter == "LIVE":
                query = query.where(Test.status.in_(["LIVE", "PUBLISHED"]))
            else:
                query = query.where(Test.status == status_filter)
        else:
            query = query.where(Test.status != "ARCHIVED")

        if series_id:
            query = query.where(Test.test_series_id == series_id)

        if subject_id:
            query = query.where(Test.subject_id == subject_id)

        if search:
            s = f"%{search.strip()}%"
            query = query.where(
                Test.title.ilike(s) | Test.code.ilike(s) | (Test.topics_covered.is_not(None) & Test.topics_covered.ilike(s))
            )

        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = list(
            db.scalars(
                query.order_by(Test.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return items, total

    @staticmethod
    def update_test(db: Session, test_id: uuid.UUID, data: TestUpdate, user_id: uuid.UUID) -> Test:
        test = TestService.get_test(db, test_id)

        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify an examination with status '{test.status}'. Historical examination papers and results are immutable. Use 'Duplicate' to create a new paper.",
            )

        is_live = test.status in ("LIVE", "PUBLISHED", "PAUSED")
        has_attempts = bool(test.attempts and len(test.attempts) > 0)
        active_attempts = [a for a in (test.attempts or []) if a.status == "IN_PROGRESS"]
        has_active_attempts = len(active_attempts) > 0

        schedule_changed = (data.start_time is not None and data.start_time != test.start_time) or (
            data.end_time is not None and data.end_time != test.end_time
        )
        status_changed = data.status is not None and data.status != test.status
        old_status = test.status

        scoring_changed = (
            (data.positive_marks is not None and data.positive_marks != test.positive_marks)
            or (data.negative_marks is not None and data.negative_marks != test.negative_marks)
            or (data.question_order is not None and data.question_order != test.question_order)
            or (data.option_order is not None and data.option_order != test.option_order)
        )
        duration_changed = (data.duration_minutes is not None and data.duration_minutes != test.duration_minutes)
        settings_changed = (
            scoring_changed
            or duration_changed
            or (data.allow_resume is not None and data.allow_resume != test.allow_resume)
            or (data.result_visibility is not None and data.result_visibility != test.result_visibility)
            or (data.show_answers is not None and data.show_answers != test.show_answers)
            or (data.show_explanation is not None and data.show_explanation != test.show_explanation)
        )

        if has_active_attempts and scoring_changed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify scoring parameters or question ordering while {len(active_attempts)} candidate(s) are actively taking the examination. Wait for active candidates to exit or conclude the exam.",
            )

        # If duration changed and active candidates exist, dynamically adjust active candidate attempt expiry timers
        if duration_changed and has_active_attempts and data.duration_minutes:
            delta_minutes = data.duration_minutes - test.duration_minutes
            for att in active_attempts:
                if att.expires_at:
                    att.expires_at = att.expires_at + timedelta(minutes=delta_minutes)
            TestService.log_audit(
                db,
                test.id,
                user_id,
                "DURATION_UPDATED",
                f"Examination duration modified from {test.duration_minutes}m to {data.duration_minutes}m. Adjusted timers for {len(active_attempts)} active candidate(s).",
            )

        if status_changed:
            target_status = data.status
            allowed = VALID_TEST_TRANSITIONS.get(test.status, set())
            if target_status not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid state transition: Cannot change status from {test.status} to {target_status}.",
                )
            if test.status == "SCHEDULED" and target_status == "DRAFT" and has_attempts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot return scheduled examination to DRAFT because candidate attempts exist.",
                )

        if data.title is not None:
            test.title = data.title.strip()
        if data.code is not None:
            new_code = data.code.strip().upper()
            if new_code != test.code:
                existing = db.scalar(select(Test).where(Test.code == new_code))
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Test code '{new_code}' is already in use.",
                    )
                test.code = new_code
        if data.description is not None:
            test.description = data.description.strip() if data.description else None
        if data.instructions is not None:
            test.instructions = data.instructions.strip() if data.instructions else None
        if data.topics_covered is not None:
            test.topics_covered = data.topics_covered.strip() if data.topics_covered else None
        if data.test_series_id is not None:
            test.test_series_id = data.test_series_id
        if data.series_order is not None:
            test.series_order = data.series_order
        if data.subject_id is not None:
            test.subject_id = data.subject_id
        if data.duration_minutes is not None:
            test.duration_minutes = data.duration_minutes
        if data.status is not None:
            test.status = data.status
        if data.positive_marks is not None:
            test.positive_marks = data.positive_marks
        if data.negative_marks is not None:
            test.negative_marks = data.negative_marks
        if data.question_order is not None:
            test.question_order = data.question_order
        if data.option_order is not None:
            test.option_order = data.option_order
        if data.result_visibility is not None:
            test.result_visibility = data.result_visibility
        if data.show_answers is not None:
            test.show_answers = data.show_answers
        if data.show_explanation is not None:
            test.show_explanation = data.show_explanation
        if data.allow_resume is not None:
            test.allow_resume = data.allow_resume
        if data.start_time is not None:
            test.start_time = data.start_time
        if data.end_time is not None:
            test.end_time = data.end_time

        # Granular Audit Logging
        if status_changed:
            TestService.log_audit(
                db, test.id, user_id, "TEST_STATUS_CHANGED", f"Status changed from {old_status} to {test.status}"
            )
        if schedule_changed:
            TestService.log_audit(
                db, test.id, user_id, "SCHEDULE_CHANGED", f"Updated examination schedule: start={test.start_time}, end={test.end_time}"
            )
        if settings_changed:
            TestService.log_audit(
                db, test.id, user_id, "TEST_SETTINGS_CHANGED", f"Updated examination settings / rules for '{test.title}'"
            )
        if not (status_changed or schedule_changed or settings_changed):
            TestService.log_audit(
                db, test.id, user_id, "TEST_EDITED", f"Updated details for '{test.title}'"
            )

        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def add_question_inline(
        db: Session,
        test_id: uuid.UUID,
        payload: InlineQuestionCreate,
        user_id: uuid.UUID,
    ) -> Test:
        """Add a newly composed question directly into the examination paper."""
        test = TestService.get_test(db, test_id)

        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add questions to an examination that is {test.status}.",
            )

        if test.status in ("LIVE", "PUBLISHED", "PAUSED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add questions while examination is {test.status}.",
            )

        if test.attempts and len(test.attempts) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot structurally modify examination paper once candidate attempts exist.",
            )

        # Subject selection: if test has a subject, use it, else pick first active subject
        subject_id = test.subject_id
        if not subject_id:
            first_subj = db.scalar(select(Subject).where(Subject.status == "ACTIVE"))
            if not first_subj:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please create at least one subject before adding questions.",
                )
            subject_id = first_subj.id

        # Create question entity
        q_create = QuestionCreate(
            question_type=payload.question_type,
            subject_id=subject_id,
            difficulty=payload.difficulty,
            content=payload.content,
            explanation=payload.explanation,
            hint=payload.hint,
            marks=payload.marks if payload.marks is not None else test.positive_marks,
            negative_marks=payload.negative_marks if payload.negative_marks is not None else test.negative_marks,
            numerical_answer=payload.numerical_answer,
            numerical_tolerance=payload.numerical_tolerance,
            options=payload.options,
            media_ids=payload.media_ids,
        )

        created_q = QuestionService.create_question(db, q_create, user_id=user_id, auto_commit=False)

        # Determine next order index
        current_orders = [tq.order_index for tq in (test.test_questions or [])]
        next_order = (max(current_orders) + 1) if current_orders else 1

        tq = TestQuestion(
            test_id=test.id,
            question_id=created_q.id,
            order_index=next_order,
            marks=q_create.marks,
            negative_marks=q_create.negative_marks,
        )
        tq.question = created_q
        db.add(tq)
        if test.test_questions is None:
            test.test_questions = []
        test.test_questions.append(tq)

        # Audit log
        TestService.log_audit(
            db,
            test.id,
            user_id,
            "QUESTION_ADDED",
            f"Added #{next_order} ({payload.question_type}) to test",
            commit=False,
        )

        db.commit()
        return test

    @staticmethod
    def batch_add_questions_inline(
        db: Session,
        test_id: uuid.UUID,
        payloads: List[InlineQuestionCreate],
        user_id: uuid.UUID,
    ) -> Test:
        """Add multiple questions in an atomic batch to the test paper."""
        test = TestService.get_test(db, test_id)

        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add questions to an examination that is {test.status}.",
            )

        if test.status in ("LIVE", "PUBLISHED", "PAUSED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add questions while examination is {test.status}.",
            )

        attempt_count = db.scalar(select(func.count(TestAttempt.id)).where(TestAttempt.test_id == test_id)) or 0
        if attempt_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot structurally modify examination paper once candidate attempts exist.",
            )

        # Subject selection: if test has a subject, use it, else pick first active subject
        subject_id = test.subject_id
        if not subject_id:
            first_subj = db.scalar(select(Subject).where(Subject.status == "ACTIVE"))
            if not first_subj:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please create at least one subject before adding questions.",
                )
            subject_id = first_subj.id

        current_orders = [tq.order_index for tq in (test.test_questions or [])]
        next_order = (max(current_orders) + 1) if current_orders else 1
        if test.test_questions is None:
            test.test_questions = []

        for payload in payloads:
            q_create = QuestionCreate(
                question_type=payload.question_type,
                subject_id=subject_id,
                difficulty=payload.difficulty,
                content=payload.content,
                explanation=payload.explanation,
                hint=payload.hint,
                marks=payload.marks if payload.marks is not None else test.positive_marks,
                negative_marks=payload.negative_marks if payload.negative_marks is not None else test.negative_marks,
                numerical_answer=payload.numerical_answer,
                numerical_tolerance=payload.numerical_tolerance,
                options=payload.options,
                media_ids=payload.media_ids,
            )

            created_q = QuestionService.create_question(db, q_create, user_id=user_id, auto_commit=False)

            tq = TestQuestion(
                test_id=test.id,
                question_id=created_q.id,
                order_index=next_order,
                marks=q_create.marks,
                negative_marks=q_create.negative_marks,
            )
            tq.question = created_q
            db.add(tq)
            test.test_questions.append(tq)
            next_order += 1

        TestService.log_audit(
            db,
            test.id,
            user_id,
            "BATCH_QUESTIONS_ADDED",
            f"Imported {len(payloads)} questions in batch to examination paper",
            commit=False,
        )

        db.commit()
        return test

    @staticmethod
    def update_question_inline(
        db: Session,
        test_id: uuid.UUID,
        question_id: uuid.UUID,
        payload: InlineQuestionCreate,
        user_id: uuid.UUID,
    ) -> Test:
        """Update an existing question inside the test paper with audit tracking."""
        test = TestService.get_test(db, test_id)

        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify questions on an examination that is {test.status}.",
            )

        is_live = test.status in ("LIVE", "PUBLISHED", "PAUSED")
        attempt_count = db.scalar(select(func.count(TestAttempt.id)).where(TestAttempt.test_id == test_id)) or 0
        has_attempts = attempt_count > 0

        if is_live or has_attempts:
            # During LIVE examination or if attempts exist, structural changes are restricted.
            tq_check = db.scalar(
                select(TestQuestion).where(
                    TestQuestion.test_id == test_id,
                    TestQuestion.question_id == question_id,
                )
            )
            if not tq_check or not tq_check.question:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in test.")
            if payload.question_type != tq_check.question.question_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change question type once candidates have attempts or examination is active.",
                )
            if payload.marks is not None and payload.marks != tq_check.marks:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot alter scoring parameters once candidates have attempts or examination is active.",
                )
            if payload.negative_marks is not None and payload.negative_marks != tq_check.negative_marks:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot alter negative marks once candidates have attempts or examination is active.",
                )

        # Update base question details
        q_update = QuestionUpdate(
            question_type=payload.question_type,
            difficulty=payload.difficulty,
            content=payload.content,
            explanation=payload.explanation,
            hint=payload.hint,
            marks=payload.marks if payload.marks is not None else test.positive_marks,
            negative_marks=payload.negative_marks if payload.negative_marks is not None else test.negative_marks,
            numerical_answer=payload.numerical_answer,
            numerical_tolerance=payload.numerical_tolerance,
            options=payload.options,
            media_ids=payload.media_ids,
        )

        updated_q = QuestionService.update_question(db, question_id, q_update, auto_commit=False)

        # Update test_questions marks if present
        tq = next((item for item in (test.test_questions or []) if item.question_id == question_id), None)
        if not tq:
            tq = db.scalar(
                select(TestQuestion).where(
                    TestQuestion.test_id == test_id,
                    TestQuestion.question_id == question_id,
                )
            )
        if tq:
            tq.marks = q_update.marks
            tq.negative_marks = q_update.negative_marks
            tq.question = updated_q

        # Audit log
        if is_live:
            TestService.log_audit(
                db,
                test.id,
                user_id,
                "ADMIN_CORRECTION",
                f"Administrative errata/correction applied to Question #{tq.order_index if tq else '?'} while exam is LIVE",
                commit=False,
            )
        else:
            TestService.log_audit(
                db,
                test.id,
                user_id,
                "QUESTION_EDITED",
                f"Updated question ({payload.question_type}) content & scoring in test",
                commit=False,
            )

        db.commit()
        return test

    @staticmethod
    def remove_question_from_test(
        db: Session,
        test_id: uuid.UUID,
        question_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Test:
        """Remove a question directly from the test paper with re-indexing and audit tracking."""
        test = TestService.get_test(db, test_id)
        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot remove questions from an examination that is {test.status}.",
            )

        if test.status in ("LIVE", "PUBLISHED", "PAUSED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete questions while examination is {test.status}.",
            )

        attempt_count = db.scalar(select(func.count(TestAttempt.id)).where(TestAttempt.test_id == test_id)) or 0
        if attempt_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot structurally modify examination paper once candidate attempts exist.",
            )

        tq = db.scalar(
            select(TestQuestion).where(
                TestQuestion.test_id == test_id,
                TestQuestion.question_id == question_id,
            )
        )
        if not tq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in test.")

        removed_order = tq.order_index
        db.delete(tq)
        db.flush()

        if test.test_questions:
            test.test_questions = [item for item in test.test_questions if item.question_id != question_id]
            for idx, item in enumerate(sorted(test.test_questions, key=lambda x: x.order_index), start=1):
                item.order_index = idx

        TestService.log_audit(
            db,
            test.id,
            user_id,
            "QUESTION_DELETED",
            f"Removed question #{removed_order} from examination paper",
            commit=False,
        )
        db.commit()
        return test

    @staticmethod
    def sync_questions(db: Session, test_id: uuid.UUID, questions: List[TestQuestionSyncItem], user_id: uuid.UUID) -> Test:
        """Synchronize and reorder questions in a test."""
        test = TestService.get_test(db, test_id)

        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify questions on an examination that is {test.status}.",
            )

        if test.status in ("LIVE", "PUBLISHED", "PAUSED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify or reorder questions while examination is {test.status}.",
            )

        attempt_count = db.scalar(select(func.count(TestAttempt.id)).where(TestAttempt.test_id == test_id)) or 0
        if attempt_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot structurally modify examination paper once candidate attempts exist.",
            )

        q_ids = [q.question_id for q in questions]
        if len(q_ids) != len(set(q_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate question IDs in question list.",
            )

        existing_questions = list(db.scalars(select(Question.id).where(Question.id.in_(q_ids))).all())
        if len(existing_questions) != len(q_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more questions could not be found.",
            )

        db.execute(delete(TestQuestion).where(TestQuestion.test_id == test_id))

        for item in questions:
            tq = TestQuestion(
                test_id=test_id,
                question_id=item.question_id,
                order_index=item.order_index,
                marks=item.marks if item.marks is not None else test.positive_marks,
                negative_marks=item.negative_marks if item.negative_marks is not None else test.negative_marks,
            )
            db.add(tq)

        TestService.log_audit(
            db, test.id, user_id, "QUESTIONS_REORDERED", f"Updated sequence of {len(questions)} questions"
        )

        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def publish_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Validate and publish/schedule a test."""
        test = TestService.get_test(db, test_id)

        if not test.test_questions or len(test.test_questions) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot publish an exam with zero questions. Add questions first.",
            )

        if test.duration_minutes <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Test duration must be greater than 0 minutes.",
            )

        # Ensure a valid, non-empty access code exists on the test
        if not test.code or not test.code.strip():
            subject_code = test.subject.code if test.subject else None
            test.code = TestService.generate_access_code(db, subject_code)
        else:
            test.code = test.code.strip().upper()

        now = datetime.now(timezone.utc)
        if test.start_time and test.start_time > now:
            test.status = "SCHEDULED"
            action = "TEST_SCHEDULED"
            msg = f"Scheduled test to start at {test.start_time.isoformat()} with access code '{test.code}'"
        else:
            test.status = "LIVE"
            action = "TEST_PUBLISHED"
            msg = f"Published test paper live with access code '{test.code}'"

        test.published_at = now
        TestService.log_audit(db, test.id, user_id, action, msg)

        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def archive_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        test = TestService.get_test(db, test_id)
        test.status = "ARCHIVED"
        TestService.log_audit(db, test.id, user_id, "TEST_ARCHIVED", "Archived examination paper")
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def delete_test_permanently(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Permanently and irreversibly delete a test paper and all its data.

        Only tests in DRAFT, ARCHIVED, or CANCELLED status may be deleted.
        LIVE, PAUSED, SCHEDULED, and COMPLETED tests are protected — end or cancel them first.

        All child records (test_questions, test_attempts, test_attempt_answers,
        attempt_integrity_events, test_audit_logs) cascade automatically via DB-level ON DELETE CASCADE.
        """
        test = TestService.get_test(db, test_id)

        DELETABLE_STATUSES = {"DRAFT", "ARCHIVED", "CANCELLED"}
        if test.status not in DELETABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot delete a test in '{test.status}' status. "
                    f"Only DRAFT, ARCHIVED, or CANCELLED tests may be permanently deleted. "
                    f"End or cancel the test first."
                ),
            )

        title = test.title or str(test_id)

        # All child tables have ON DELETE CASCADE — a single delete cascades everything
        db.delete(test)
        db.commit()

        logger.info(
            "Test paper '%s' (id=%s) permanently deleted by user %s.", title, test_id, user_id
        )


    @staticmethod
    def complete_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Conclude an ongoing examination, moving status to COMPLETED and finalizing all active attempts."""
        test = TestService.get_test(db, test_id)
        if test.status in ("COMPLETED", "CLOSED"):
            return test
        if test.status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot conclude a CANCELLED examination.",
            )
        test.status = "COMPLETED"
        now = datetime.now(timezone.utc)
        if not test.end_time or test.end_time > now:
            test.end_time = now

        # Finalize any active in-progress candidate attempts
        active_attempts = list(
            db.scalars(
                select(TestAttempt).where(
                    TestAttempt.test_id == test_id, TestAttempt.status == "IN_PROGRESS"
                )
            ).all()
        )
        for att in active_attempts:
            from backend.app.services.attempt_service import AttemptService
            AttemptService._evaluate_and_complete_attempt(
                db, att, test, is_expired=True, submission_reason="ADMIN_CONCLUDED"
            )

        TestService.log_audit(
            db,
            test.id,
            user_id,
            "TEST_COMPLETED",
            f"Examination paper '{test.title}' concluded / marked as COMPLETED by administrator",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def reschedule_test(
        db: Session,
        test_id: uuid.UUID,
        start_time: datetime,
        end_time: Optional[datetime],
        user_id: uuid.UUID,
    ) -> Test:
        """Reschedule a SCHEDULED examination."""
        test = TestService.get_test(db, test_id)
        if test.status not in ("SCHEDULED", "DRAFT"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only SCHEDULED or DRAFT examinations can be rescheduled (current: {test.status}).",
            )
        now = datetime.now(timezone.utc)
        st = start_time.replace(tzinfo=timezone.utc) if start_time.tzinfo is None else start_time
        if st <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scheduled start time must be in the future.",
            )
        if end_time:
            et = end_time.replace(tzinfo=timezone.utc) if end_time.tzinfo is None else end_time
            if et <= st:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scheduled end time must be after the start time.",
                )
            test.end_time = et
        else:
            test.end_time = None

        test.start_time = st
        test.status = "SCHEDULED"
        TestService.log_audit(
            db,
            test.id,
            user_id,
            "SCHEDULE_CHANGED",
            f"Rescheduled examination: start={st.isoformat()}, end={test.end_time.isoformat() if test.end_time else 'None'}",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def unschedule_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Move a SCHEDULED examination back to DRAFT state."""
        test = TestService.get_test(db, test_id)
        if test.status != "SCHEDULED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only SCHEDULED examinations can be moved to DRAFT (current: {test.status}).",
            )
        attempt_count = db.scalar(
            select(func.count(TestAttempt.id)).where(TestAttempt.test_id == test_id)
        ) or 0
        if attempt_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot return scheduled examination to DRAFT because candidate attempts exist.",
            )
        test.status = "DRAFT"
        TestService.log_audit(
            db,
            test.id,
            user_id,
            "TEST_STATUS_CHANGED",
            "Moved examination from SCHEDULED back to DRAFT",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def pause_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Temporarily pause an ongoing LIVE examination."""
        test = TestService.get_test(db, test_id)
        if test.status not in ("LIVE", "PUBLISHED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only LIVE examinations can be paused (current: {test.status}).",
            )
        now = datetime.now(timezone.utc)
        test.status = "PAUSED"
        test.paused_at = now
        TestService.log_audit(
            db,
            test.id,
            user_id,
            "EXAM_PAUSED",
            f"Examination paused by administrator at {now.isoformat()}",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def resume_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Resume a PAUSED examination and extend timers for all active in-progress candidates."""
        test = TestService.get_test(db, test_id)
        if test.status != "PAUSED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only PAUSED examinations can be resumed (current: {test.status}).",
            )
        now = datetime.now(timezone.utc)
        pause_duration = timedelta(seconds=0)
        if test.paused_at:
            p_at = test.paused_at.replace(tzinfo=timezone.utc) if test.paused_at.tzinfo is None else test.paused_at
            pause_duration = max(timedelta(seconds=0), now - p_at)

        # Extend expires_at for all active IN_PROGRESS attempts
        active_attempts = list(
            db.scalars(
                select(TestAttempt).where(
                    TestAttempt.test_id == test_id, TestAttempt.status == "IN_PROGRESS"
                )
            ).all()
        )
        for att in active_attempts:
            if att.expires_at:
                exp = att.expires_at.replace(tzinfo=timezone.utc) if att.expires_at.tzinfo is None else att.expires_at
                att.expires_at = exp + pause_duration

        # Extend scheduled end_time if set
        if test.end_time:
            et = test.end_time.replace(tzinfo=timezone.utc) if test.end_time.tzinfo is None else test.end_time
            test.end_time = et + pause_duration

        test.status = "LIVE"
        test.paused_at = None
        duration_secs = int(pause_duration.total_seconds())
        TestService.log_audit(
            db,
            test.id,
            user_id,
            "EXAM_RESUMED",
            f"Examination resumed after pause of {duration_secs} seconds. Active attempt timers credited with {duration_secs}s extension.",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def cancel_test(
        db: Session,
        test_id: uuid.UUID,
        user_id: uuid.UUID,
        reason: Optional[str] = None,
    ) -> Test:
        """Cancel an examination permanently, preventing new attempts and safely concluding active ones."""
        test = TestService.get_test(db, test_id)
        if test.status in ("COMPLETED", "CLOSED", "CANCELLED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel an examination that is already {test.status}.",
            )
        now = datetime.now(timezone.utc)
        test.status = "CANCELLED"
        test.cancelled_at = now
        test.cancelled_by = user_id
        test.cancel_reason = reason.strip() if reason else None

        # Transition any active in-progress attempts to CANCELLED without destroying historical submissions
        active_attempts = list(
            db.scalars(
                select(TestAttempt).where(
                    TestAttempt.test_id == test_id, TestAttempt.status == "IN_PROGRESS"
                )
            ).all()
        )
        for att in active_attempts:
            att.status = "CANCELLED"
            att.submission_reason = "CANCELLED"
            att.submitted_at = now

        TestService.log_audit(
            db,
            test.id,
            user_id,
            "EXAM_CANCELLED",
            f"Examination permanently cancelled. Reason: {test.cancel_reason or 'No reason provided'}",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def restore_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Restore an ARCHIVED test back to COMPLETED or DRAFT."""
        test = TestService.get_test(db, test_id)
        if test.status != "ARCHIVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only ARCHIVED examination papers can be restored.",
            )
        has_submissions = any(
            a.status in ("SUBMITTED", "COMPLETED") for a in (test.attempts or [])
        )
        new_status = "COMPLETED" if has_submissions else "DRAFT"
        test.status = new_status
        TestService.log_audit(
            db,
            test.id,
            user_id,
            "TEST_RESTORED",
            f"Restored examination paper '{test.title}' from ARCHIVED to {new_status}",
        )
        db.commit()
        db.expire_all()
        return TestService.get_test(db, test_id)

    @staticmethod
    def duplicate_test(db: Session, test_id: uuid.UUID, user_id: uuid.UUID) -> Test:
        """Safely duplicate/recreate an examination paper as a clean DRAFT, preserving original exam and all historical attempts."""
        original = TestService.get_test(db, test_id)
        subject_code = original.subject.code if original.subject else None
        new_code = TestService.generate_access_code(db, subject_code)

        new_test = Test(
            title=f"{original.title} (Copy)",
            code=new_code,
            description=original.description,
            instructions=original.instructions,
            topics_covered=original.topics_covered,
            test_series_id=original.test_series_id,
            subject_id=original.subject_id,
            duration_minutes=original.duration_minutes,
            status="DRAFT",
            positive_marks=original.positive_marks,
            negative_marks=original.negative_marks,
            question_order=original.question_order,
            option_order=original.option_order,
            result_visibility=original.result_visibility,
            show_answers=original.show_answers,
            show_explanation=original.show_explanation,
            allow_resume=original.allow_resume,
            created_by=user_id,
            start_time=None,
            end_time=None,
            published_at=None,
            paused_at=None,
            cancelled_at=None,
            cancelled_by=None,
            cancel_reason=None,
        )
        db.add(new_test)
        db.flush()

        for tq in original.test_questions:
            cloned_tq = TestQuestion(
                test_id=new_test.id,
                question_id=tq.question_id,
                order_index=tq.order_index,
                marks=tq.marks,
                negative_marks=tq.negative_marks,
            )
            db.add(cloned_tq)

        TestService.log_audit(
            db, new_test.id, user_id, "TEST_CREATED", f"Duplicated / recreated from '{original.title}' ({original.code})"
        )

        db.commit()
        db.expire_all()
        return TestService.get_test(db, new_test.id)

    @staticmethod
    def get_audit_logs(db: Session, test_id: uuid.UUID) -> List[TestAuditLogResponse]:
        logs = db.scalars(
            select(TestAuditLog)
            .options(joinedload(TestAuditLog.user))
            .where(TestAuditLog.test_id == test_id)
            .order_by(TestAuditLog.created_at.desc())
        ).all()
        return [
            TestAuditLogResponse(
                id=log.id,
                test_id=log.test_id,
                user_id=log.user_id,
                admin_name=(log.user.display_name or log.user.username) if log.user else "Admin",
                action=log.action,
                details=log.details,
                created_at=log.created_at,
            )
            for log in logs
        ]

    @staticmethod
    def to_response(test: Test, include_questions: bool = True) -> TestResponse:
        diff_counts: Dict[str, int] = {"EASY": 0, "MEDIUM": 0, "HARD": 0}
        total_marks = 0.0
        q_items: List[TestQuestionItem] = []

        if test.test_questions:
            for tq in sorted(test.test_questions, key=lambda x: x.order_index):
                marks = tq.marks if tq.marks is not None else test.positive_marks
                total_marks += marks
                if tq.question:
                    diff = tq.question.difficulty or "MEDIUM"
                    diff_counts[diff] = diff_counts.get(diff, 0) + 1
                    if include_questions:
                        q_items.append(
                            TestQuestionItem(
                                id=tq.id,
                                test_id=tq.test_id,
                                question_id=tq.question_id,
                                order_index=tq.order_index,
                                marks=tq.marks,
                                negative_marks=tq.negative_marks,
                                question=QuestionResponse.model_validate(tq.question),
                            )
                        )

        total_participants = len(test.attempts) if test.attempts else 0
        total_submissions = (
            sum(1 for a in test.attempts if a.status in ("SUBMITTED", "COMPLETED", "EXPIRED"))
            if test.attempts
            else 0
        )
        active_candidates_count = (
            sum(1 for a in test.attempts if a.status == "IN_PROGRESS")
            if test.attempts
            else 0
        )

        # Normalize display status based on schedule and server time
        now = datetime.now(timezone.utc)
        display_status = test.status
        if test.status in ("LIVE", "PUBLISHED", "SCHEDULED") and test.end_time:
            et = test.end_time.replace(tzinfo=timezone.utc) if test.end_time.tzinfo is None else test.end_time
            if now > et:
                display_status = "COMPLETED"
        elif test.status == "SCHEDULED" and test.start_time:
            st = test.start_time.replace(tzinfo=timezone.utc) if test.start_time.tzinfo is None else test.start_time
            if now >= st:
                display_status = "LIVE"
        elif display_status == "PUBLISHED":
            display_status = "LIVE"
        elif display_status == "CLOSED":
            display_status = "COMPLETED"

        return TestResponse(
            id=test.id,
            title=test.title,
            code=test.code,
            description=test.description,
            instructions=test.instructions,
            topics_covered=test.topics_covered,
            test_series_id=test.test_series_id,
            test_series_name=test.test_series.name if test.test_series else None,
            series_order=test.series_order or 1,
            subject_id=test.subject_id,
            subject_name=test.subject.name if test.subject else None,
            duration_minutes=test.duration_minutes,
            status=display_status,
            positive_marks=test.positive_marks,
            negative_marks=test.negative_marks,
            question_order=test.question_order,
            option_order=test.option_order,
            result_visibility=test.result_visibility,
            show_answers=test.show_answers,
            show_explanation=test.show_explanation,
            allow_resume=test.allow_resume,
            start_time=test.start_time,
            end_time=test.end_time,
            published_at=test.published_at,
            paused_at=test.paused_at,
            cancelled_at=test.cancelled_at,
            cancel_reason=test.cancel_reason,
            created_by=test.created_by,
            created_at=test.created_at,
            updated_at=test.updated_at,
            question_count=len(test.test_questions) if test.test_questions else 0,
            total_marks=total_marks,
            attempts_count=total_submissions,
            total_participants=total_participants,
            total_submissions=total_submissions,
            active_candidates_count=active_candidates_count,
            difficulty_breakdown=diff_counts,
            questions=q_items,
        )
