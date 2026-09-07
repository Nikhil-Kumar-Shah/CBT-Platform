import json
import random
import re
import urllib.parse
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^\+?[0-9\s\-\(\)]{7,20}$")

from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status

from backend.app.core.rate_limit import access_code_tracker
from backend.app.services.audit_service import AuditService
from backend.app.models.test import Test
from backend.app.models.test_attempt import TestAttempt, TestAttemptAnswer
from backend.app.models.test_question import TestQuestion
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.schemas.attempt import (
    AccessCodeVerifyRequest,
    AccessCodeVerifyResponse,
    AttemptStartRequest,
    AttemptQuestionOptionItem,
    AttemptQuestionItem,
    AttemptAnswerItem,
    AttemptSessionStateResponse,
    AttemptSaveAnswerRequest,
    AttemptSaveAnswerResponse,
    AttemptHeartbeatRequest,
    AttemptHeartbeatResponse,
    AttemptSubmitRequest,
    AttemptResultResponse,
    AttemptQuestionResultItem,
)


class AttemptService:
    @staticmethod
    def _lookup_test_by_code(db: Session, raw_code: str, options: list = None) -> Test:
        """Robustly look up an examination by access code with normalization and input validation."""
        if not raw_code or not str(raw_code).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Examination access code is required.",
            )

        cleaned = str(raw_code).strip()

        # If user pasted a full URL (e.g. http://localhost:3000/exam?code=PHY-MOCK-EK8S), extract the code parameter
        if "code=" in cleaned:
            try:
                parsed = urllib.parse.urlparse(cleaned)
                params = urllib.parse.parse_qs(parsed.query)
                if "code" in params and params["code"]:
                    cleaned = params["code"][0].strip()
            except Exception:
                pass

        # Check if the user entered an internal database UUID instead of the access code
        try:
            val_uuid = uuid.UUID(cleaned)
            test_by_id = db.scalar(select(Test.id).where(Test.id == val_uuid))
            if test_by_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The credential entered is an internal examination ID, not a candidate access code. Please use the candidate Access Code (e.g. PHY-MOCK-XXXX) displayed in the admin portal.",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid access code format. Please enter the candidate access code provided by your instructor.",
                )
        except ValueError:
            pass

        # Normalize whitespace (e.g., "PHY - MOCK - EK8S" -> "PHY-MOCK-EK8S")
        normalized = re.sub(r"\s+", "", cleaned).upper()

        query = select(Test)
        if options:
            query = query.options(*options)

        # 1. Primary lookup: Exact match (case-insensitive)
        test = db.scalar(query.where(func.upper(Test.code) == normalized))
        if test:
            return test

        # 2. Resilient fallback: Hyphen-insensitive match (e.g., candidate typed "PHYMOCKEK8S")
        code_no_hyphens = normalized.replace("-", "")
        test = db.scalar(query.where(func.replace(func.upper(Test.code), "-", "") == code_no_hyphens))
        if test:
            return test

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No examination found with access code '{cleaned}'. Please verify the code with your instructor.",
        )

    @staticmethod
    def verify_access_code(db: Session, access_code: str, client_ip: Optional[str] = None) -> AccessCodeVerifyResponse:
        if client_ip:
            is_locked, rem_seconds = access_code_tracker.is_locked(client_ip)
            if is_locked:
                try:
                    AuditService.log(
                        db=db,
                        event_type="ACCESS_CODE_BRUTE_FORCE",
                        category="SECURITY",
                        severity="CRITICAL",
                        actor="Candidate",
                        actor_type="CANDIDATE",
                        action="VERIFY_CODE",
                        resource_type="ACCESS_CODE",
                        resource_id=(access_code or "")[:12],
                        description=f"Access code verification blocked due to repeated failures from IP {client_ip}",
                        ip_address=client_ip,
                    )
                except Exception:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many failed access code attempts. Please wait {rem_seconds} seconds before trying again.",
                    headers={"Retry-After": str(rem_seconds)},
                )

        try:
            test = AttemptService._lookup_test_by_code(
                db,
                access_code,
                options=[
                    selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
                    selectinload(Test.subject),
                ],
            )
        except HTTPException as he:
            if client_ip and he.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST):
                access_code_tracker.record_failure(client_ip)
                try:
                    AuditService.log(
                        db=db,
                        event_type="ACCESS_CODE_FAILURE",
                        category="SECURITY",
                        severity="WARNING",
                        actor="Candidate",
                        actor_type="CANDIDATE",
                        action="VERIFY_CODE",
                        resource_type="ACCESS_CODE",
                        resource_id=(access_code or "")[:12],
                        description=f"Failed access code lookup from IP {client_ip}",
                        ip_address=client_ip,
                    )
                except Exception:
                    pass
            raise

        if client_ip:
            access_code_tracker.record_success(client_ip)

        if test.status == "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination is still in draft state and is not ready for candidates.",
            )
        if test.status == "ARCHIVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination has been archived and is no longer accessible.",
            )
        if test.status in ("COMPLETED", "CLOSED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination has concluded. Submissions are closed.",
            )
        if test.status == "PAUSED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination is temporarily paused by the administrator.",
            )
        if test.status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination has been cancelled by the administrator.",
            )

        total_questions = len(test.test_questions)
        if total_questions == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination does not contain any questions yet.",
            )

        now = datetime.now(timezone.utc)
        is_lobby_open = False
        starts_in_seconds = 0
        can_start = True

        if test.start_time:
            st = test.start_time.replace(tzinfo=timezone.utc) if test.start_time.tzinfo is None else test.start_time
            if now < st:
                is_lobby_open = True
                starts_in_seconds = max(0, int((st - now).total_seconds()))
                can_start = False
            else:
                is_lobby_open = False
                starts_in_seconds = 0
                can_start = True

        if test.end_time:
            et = test.end_time.replace(tzinfo=timezone.utc) if test.end_time.tzinfo is None else test.end_time
            if now > et:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The scheduled window for this examination has passed and it is closed.",
                )

        total_marks = sum(
            tq.marks if tq.marks is not None else (tq.question.marks if tq.question and tq.question.marks is not None else test.positive_marks)
            for tq in test.test_questions
        )

        return AccessCodeVerifyResponse(
            test_id=test.id,
            title=test.title,
            code=test.code,
            description=test.description,
            instructions=test.instructions,
            topics_covered=test.topics_covered,
            subject_name=test.subject.name if test.subject else None,
            duration_minutes=test.duration_minutes,
            positive_marks=test.positive_marks,
            negative_marks=test.negative_marks,
            total_questions=total_questions,
            total_marks=round(total_marks, 2),
            allow_resume=test.allow_resume,
            result_visibility=test.result_visibility,
            status=test.status,
            start_time=test.start_time,
            end_time=test.end_time,
            server_time=now,
            server_now=now,
            is_lobby_open=is_lobby_open,
            starts_in_seconds=starts_in_seconds,
            can_start=can_start,
        )

    @staticmethod
    def start_or_resume_attempt(db: Session, payload: AttemptStartRequest) -> AttemptSessionStateResponse:
        candidate_name = payload.candidate_name.strip() if payload.candidate_name else ""
        candidate_email = payload.candidate_email.strip() if payload.candidate_email else None
        candidate_phone = payload.candidate_phone.strip() if payload.candidate_phone else None
        roll_number = payload.roll_number.strip() if payload.roll_number else None

        if not candidate_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Candidate full name is required.",
            )

        if candidate_email:
            if not EMAIL_REGEX.match(candidate_email):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Please enter a valid email address.",
                )

        if candidate_phone:
            digit_count = len(re.sub(r"\D", "", candidate_phone))
            if not PHONE_REGEX.match(candidate_phone) or digit_count < 7:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Please enter a valid phone number.",
                )

        target_code = payload.access_code or payload.code
        if not target_code or not target_code.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Access code is required to start examination.",
            )

        test = AttemptService._lookup_test_by_code(
            db,
            target_code,
            options=[
                selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
                selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.media),
                selectinload(Test.subject),
            ],
        )

        now = datetime.now(timezone.utc)

        if test.status == "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination is still in draft state and is not ready for candidates.",
            )
        if test.status == "ARCHIVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination has been archived and is no longer accessible.",
            )
        if test.status in ("COMPLETED", "CLOSED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination has concluded. Submissions are closed.",
            )
        if test.status == "PAUSED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination is temporarily paused by the administrator. Please wait for it to resume.",
            )
        if test.status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This examination has been cancelled by the administrator.",
            )

        # Check schedule
        if test.start_time:
            st = test.start_time.replace(tzinfo=timezone.utc) if test.start_time.tzinfo is None else test.start_time
            if now < st:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Your examination hasn't started yet. Please wait for the scheduled start time.",
                )

        if test.status == "SCHEDULED":
            test.status = "LIVE"
            db.flush()

        if test.status not in ("LIVE", "PUBLISHED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Examination is not currently active (status: {test.status}).",
            )

        if test.end_time:
            et = test.end_time.replace(tzinfo=timezone.utc) if test.end_time.tzinfo is None else test.end_time
            if now > et:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This examination has passed its deadline and is closed.",
                )

        # Check existing attempts for this candidate
        if candidate_email:
            query = select(TestAttempt).options(
                selectinload(TestAttempt.answers)
            ).where(
                TestAttempt.test_id == test.id,
                func.lower(TestAttempt.candidate_email) == candidate_email.lower(),
            )
        elif roll_number:
            query = select(TestAttempt).options(
                selectinload(TestAttempt.answers)
            ).where(
                TestAttempt.test_id == test.id,
                func.lower(TestAttempt.student_name) == candidate_name.lower(),
                func.lower(TestAttempt.roll_number) == roll_number.lower(),
            )
        else:
            query = select(TestAttempt).options(
                selectinload(TestAttempt.answers)
            ).where(
                TestAttempt.test_id == test.id,
                func.lower(TestAttempt.student_name) == candidate_name.lower(),
            )

        existing_attempts = db.scalars(query).all()

        submitted_attempts = [a for a in existing_attempts if a.status in ("SUBMITTED", "COMPLETED", "EXPIRED")]
        if submitted_attempts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This candidate has already submitted this examination. Retakes are not permitted.",
            )

        active_attempts = [a for a in existing_attempts if a.status == "IN_PROGRESS"]
        if active_attempts:
            active = active_attempts[0]
            if not test.allow_resume:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Reconnection or resuming this examination is disabled for this paper.",
                )

            # Check if active attempt is expired
            if active.expires_at:
                exp = active.expires_at.replace(tzinfo=timezone.utc) if active.expires_at.tzinfo is None else active.expires_at
                if now >= exp:
                    # Auto-submit expired attempt
                    AttemptService._evaluate_and_complete_attempt(
                        db, active, test, is_expired=True, submission_reason="AUTO_EXPIRED"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Your allocated examination time has expired and the session has been automatically submitted.",
                    )

            # Resume active attempt and update contact info if provided
            if candidate_email and not active.candidate_email:
                active.candidate_email = candidate_email
            if candidate_phone and not active.candidate_phone:
                active.candidate_phone = candidate_phone
            active.last_heartbeat_at = now
            db.commit()
            db.refresh(active)

            try:
                AuditService.log(
                    db=db,
                    event_type="CANDIDATE_SESSION_RESUMED",
                    category="CANDIDATES",
                    severity="INFO",
                    actor=active.student_name,
                    actor_type="CANDIDATE",
                    action="RESUME",
                    resource_type="ATTEMPT",
                    resource_id=str(active.id),
                    description=f"Candidate '{active.student_name}' resumed exam session for test '{test.title}'",
                    session_id=active.session_id,
                )
            except Exception:
                pass

            return AttemptService._build_session_state(db, active, test)

        # Create new authoritative attempt
        duration = timedelta(minutes=test.duration_minutes)
        expires_at = now + duration
        if test.end_time:
            et = test.end_time.replace(tzinfo=timezone.utc) if test.end_time.tzinfo is None else test.end_time
            if expires_at > et:
                expires_at = et

        session_id = payload.client_session_id or str(uuid.uuid4())

        # Sort questions by order_index
        sorted_tqs = sorted(test.test_questions, key=lambda x: x.order_index)

        # Handle question randomization
        q_order_ids = [str(tq.question_id) for tq in sorted_tqs]
        if test.question_order == "RANDOM":
            random.shuffle(q_order_ids)

        # Handle option randomization
        option_orders_map = {}
        for tq in sorted_tqs:
            q = tq.question
            if q and q.options:
                opt_ids = [str(o.id) for o in sorted(q.options, key=lambda x: x.option_order)]
                if test.option_order == "RANDOM":
                    random.shuffle(opt_ids)
                option_orders_map[str(q.id)] = opt_ids

        total_marks = sum(
            tq.marks if tq.marks is not None else (tq.question.marks if tq.question and tq.question.marks is not None else test.positive_marks)
            for tq in sorted_tqs
        )

        new_attempt = TestAttempt(
            test_id=test.id,
            student_name=candidate_name,
            candidate_email=candidate_email,
            candidate_phone=candidate_phone,
            roll_number=roll_number,
            status="IN_PROGRESS",
            started_at=now,
            expires_at=expires_at,
            session_id=session_id,
            last_heartbeat_at=now,
            total_marks=round(total_marks, 2),
            question_order=json.dumps(q_order_ids),
            option_orders=json.dumps(option_orders_map),
            current_question_index=0,
        )
        db.add(new_attempt)
        db.commit()
        db.refresh(new_attempt)

        try:
            AuditService.log(
                db=db,
                event_type="CANDIDATE_SESSION_STARTED",
                category="CANDIDATES",
                severity="INFO",
                actor=candidate_name,
                actor_type="CANDIDATE",
                action="START",
                resource_type="ATTEMPT",
                resource_id=str(new_attempt.id),
                description=f"Candidate '{candidate_name}' started examination attempt for '{test.title}'",
                session_id=session_id,
            )
        except Exception:
            pass

        return AttemptService._build_session_state(db, new_attempt, test)

    @staticmethod
    def get_attempt_state(
        db: Session,
        attempt_id: uuid.UUID,
        session_id: Optional[str] = None,
        is_admin: bool = False,
    ) -> AttemptSessionStateResponse:
        attempt = db.scalar(
            select(TestAttempt)
            .options(
                selectinload(TestAttempt.answers),
                selectinload(TestAttempt.test).selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
                selectinload(TestAttempt.test).selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.media),
                selectinload(TestAttempt.test).selectinload(Test.subject),
            )
            .where(TestAttempt.id == attempt_id)
        )
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

        if not is_admin:
            if not session_id or (attempt.session_id and attempt.session_id != session_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized session access.")

        now = datetime.now(timezone.utc)
        # Check expiry
        if attempt.status == "IN_PROGRESS" and attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            if now >= exp:
                AttemptService._evaluate_and_complete_attempt(
                    db, attempt, attempt.test, is_expired=True, submission_reason="AUTO_EXPIRED"
                )

        return AttemptService._build_session_state(db, attempt, attempt.test)

    @staticmethod
    def save_answer(db: Session, attempt_id: uuid.UUID, payload: AttemptSaveAnswerRequest) -> AttemptSaveAnswerResponse:
        attempt = db.scalar(
            select(TestAttempt)
            .options(
                selectinload(TestAttempt.answers),
                selectinload(TestAttempt.test).selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
            )
            .where(TestAttempt.id == attempt_id)
        )
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

        if not payload.session_id or (attempt.session_id and attempt.session_id != payload.session_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid session credentials for this attempt.")

        now = datetime.now(timezone.utc)

        # Check if test is paused or cancelled
        if attempt.test and attempt.test.status == "PAUSED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Examination is currently paused by the administrator. Answers cannot be saved while paused.",
            )
        if attempt.test and attempt.test.status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Examination has been cancelled by the administrator.",
            )

        # Check if already completed or expired
        if attempt.status != "IN_PROGRESS":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot save answer. Examination attempt is currently '{attempt.status}'.",
            )

        # Check if question belongs to the test paper
        tq = next((t for t in (attempt.test.test_questions or []) if t.question_id == payload.question_id), None)
        if not tq:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The specified question does not belong to this examination paper.",
            )

        # Check if selected options belong to the question
        opt_to_check = payload.selected_option_ids or getattr(payload, "selected_option_id", None)
        if opt_to_check and tq.question and tq.question.options:
            valid_opt_ids = {str(o.id) for o in tq.question.options}
            raw_opts = str(opt_to_check).strip()
            tokens = []
            if raw_opts.startswith("[") and raw_opts.endswith("]"):
                try:
                    parsed = json.loads(raw_opts)
                    if isinstance(parsed, list):
                        tokens = [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    pass
            if not tokens:
                if "||" in raw_opts:
                    tokens = [x.strip() for x in raw_opts.split("||") if x.strip()]
                elif "," in raw_opts:
                    tokens = [x.strip() for x in raw_opts.split(",") if x.strip()]
                else:
                    tokens = [raw_opts]

            for tok in tokens:
                try:
                    uuid.UUID(tok)
                    if tok not in valid_opt_ids:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Selected option ID does not belong to question '{payload.question_id}'.",
                        )
                except ValueError:
                    pass

        if attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            if now >= exp:
                # Flush and safely persist this incoming answer before auto-completing
                ans = next((a for a in attempt.answers if a.question_id == payload.question_id), None)
                if not ans:
                    ans = TestAttemptAnswer(attempt_id=attempt.id, question_id=payload.question_id)
                    db.add(ans)
                    attempt.answers.append(ans)
                opt_val = payload.selected_option_ids if payload.selected_option_ids is not None else getattr(payload, "selected_option_id", None)
                if opt_val is not None:
                    ans.selected_option_ids = str(opt_val)
                if payload.numerical_answer is not None:
                    ans.numerical_answer = payload.numerical_answer
                if payload.text_answer is not None:
                    ans.text_answer = payload.text_answer
                if payload.is_marked_for_review is not None:
                    ans.is_marked_for_review = payload.is_marked_for_review
                ans.answered_at = payload.client_timestamp or now
                db.flush()

                AttemptService._evaluate_and_complete_attempt(
                    db, attempt, attempt.test, is_expired=True, submission_reason="AUTO_EXPIRED"
                )
                return AttemptSaveAnswerResponse(
                    status="EXPIRED",
                    saved_at=ans.answered_at,
                    server_time=now,
                    server_now=now,
                    time_remaining_seconds=0,
                    remaining_seconds=0,
                    is_marked_for_review=ans.is_marked_for_review,
                    is_expired=True,
                )

        # Upsert answer
        ans = next((a for a in attempt.answers if a.question_id == payload.question_id), None)

        # Stale response protection: if packet arrived out-of-order with an older client timestamp, do not overwrite newer answer
        if payload.client_timestamp and ans and ans.answered_at:
            existing_ts = ans.answered_at.replace(tzinfo=timezone.utc) if ans.answered_at.tzinfo is None else ans.answered_at
            req_ts = payload.client_timestamp.replace(tzinfo=timezone.utc) if payload.client_timestamp.tzinfo is None else payload.client_timestamp
            if existing_ts > req_ts:
                time_remaining = 0
                if attempt.expires_at:
                    exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
                    time_remaining = max(0, int((exp - now).total_seconds()))
                return AttemptSaveAnswerResponse(
                    status="SAVED",
                    saved_at=existing_ts,
                    server_time=now,
                    server_now=now,
                    time_remaining_seconds=time_remaining,
                    remaining_seconds=time_remaining,
                    is_marked_for_review=ans.is_marked_for_review,
                )

        if not ans:
            ans = TestAttemptAnswer(attempt_id=attempt.id, question_id=payload.question_id)
            db.add(ans)
            attempt.answers.append(ans)

        raw_opt = payload.selected_option_ids if payload.selected_option_ids is not None else getattr(payload, "selected_option_id", None)
        if raw_opt is not None:
            if isinstance(raw_opt, (list, set, tuple)):
                items = [str(x).strip() for x in raw_opt if str(x).strip()]
                opt_str = (items[0] if len(items) == 1 else ",".join(items)) if items else None
            else:
                opt_str = str(raw_opt).strip()
                if (opt_str.startswith("['") and opt_str.endswith("']")) or (opt_str.startswith('["') and opt_str.endswith('"]')):
                    if len(opt_str) > 4:
                        opt_str = opt_str[2:-2]
            ans.selected_option_ids = opt_str
        elif payload.selected_option_ids is None and getattr(payload, "selected_option_id", None) is None and payload.numerical_answer is None and payload.text_answer is None:
            # Clear response
            ans.selected_option_ids = None

        if payload.numerical_answer is not None:
            ans.numerical_answer = payload.numerical_answer
        if payload.text_answer is not None:
            ans.text_answer = payload.text_answer
        if payload.is_marked_for_review is not None:
            ans.is_marked_for_review = payload.is_marked_for_review

        ans.answered_at = payload.client_timestamp or now

        if payload.current_question_index is not None:
            attempt.current_question_index = payload.current_question_index
        attempt.last_heartbeat_at = now

        db.commit()

        time_remaining = 0
        if attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            time_remaining = max(0, int((exp - now).total_seconds()))

        return AttemptSaveAnswerResponse(
            status="SAVED",
            saved_at=ans.answered_at,
            server_time=now,
            server_now=now,
            time_remaining_seconds=time_remaining,
            remaining_seconds=time_remaining,
            is_marked_for_review=ans.is_marked_for_review,
        )

    @staticmethod
    def heartbeat(db: Session, attempt_id: uuid.UUID, payload: AttemptHeartbeatRequest) -> AttemptHeartbeatResponse:
        attempt = db.scalar(
            select(TestAttempt)
            .options(
                selectinload(TestAttempt.answers),
                selectinload(TestAttempt.test).selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
            )
            .where(TestAttempt.id == attempt_id)
        )
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

        if not payload.session_id or (attempt.session_id and attempt.session_id != payload.session_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid session credentials.")

        now = datetime.now(timezone.utc)

        # Check if test is paused
        if attempt.test and attempt.test.status == "PAUSED":
            time_remaining = 0
            if attempt.expires_at:
                exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
                ref_time = attempt.test.paused_at.replace(tzinfo=timezone.utc) if (attempt.test.paused_at is not None and attempt.test.paused_at.tzinfo is None) else (attempt.test.paused_at if attempt.test.paused_at is not None else now)
                time_remaining = max(0, int((exp - ref_time).total_seconds()))
            return AttemptHeartbeatResponse(
                status="PAUSED",
                is_active=True,
                is_expired=False,
                is_paused=True,
                submission_reason=attempt.submission_reason,
                server_time=now,
                server_now=now,
                time_remaining_seconds=time_remaining,
                remaining_seconds=time_remaining,
            )

        if attempt.test and attempt.test.status == "CANCELLED":
            attempt.status = "CANCELLED"
            attempt.submission_reason = "CANCELLED"
            attempt.submitted_at = now
            db.commit()
            return AttemptHeartbeatResponse(
                status="CANCELLED",
                is_active=False,
                is_expired=False,
                is_paused=False,
                submission_reason="CANCELLED",
                server_time=now,
                server_now=now,
                time_remaining_seconds=0,
                remaining_seconds=0,
            )

        if attempt.status != "IN_PROGRESS":
            return AttemptHeartbeatResponse(
                status=attempt.status,
                is_active=False,
                is_expired=(attempt.status == "EXPIRED"),
                is_paused=False,
                submission_reason=attempt.submission_reason,
                server_time=now,
                server_now=now,
                time_remaining_seconds=0,
                remaining_seconds=0,
            )

        if attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            if now >= exp:
                AttemptService._evaluate_and_complete_attempt(
                    db, attempt, attempt.test, is_expired=True, submission_reason="AUTO_EXPIRED"
                )
                return AttemptHeartbeatResponse(
                    status="EXPIRED",
                    is_active=False,
                    is_expired=True,
                    is_paused=False,
                    submission_reason="AUTO_EXPIRED",
                    server_time=now,
                    server_now=now,
                    time_remaining_seconds=0,
                    remaining_seconds=0,
                )

        attempt.last_heartbeat_at = now
        if payload.current_question_index is not None:
            attempt.current_question_index = payload.current_question_index
        db.commit()

        time_remaining = 0
        if attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            time_remaining = max(0, int((exp - now).total_seconds()))

        return AttemptHeartbeatResponse(
            status="IN_PROGRESS",
            is_active=True,
            is_expired=False,
            is_paused=False,
            submission_reason=None,
            server_time=now,
            server_now=now,
            time_remaining_seconds=time_remaining,
            remaining_seconds=time_remaining,
        )

    @staticmethod
    def submit_attempt(db: Session, attempt_id: uuid.UUID, payload: AttemptSubmitRequest) -> AttemptResultResponse:
        attempt = db.scalar(
            select(TestAttempt)
            .options(
                selectinload(TestAttempt.answers),
                selectinload(TestAttempt.test).selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
                selectinload(TestAttempt.test).selectinload(Test.subject),
            )
            .where(TestAttempt.id == attempt_id)
        )
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

        if not payload.session_id or (attempt.session_id and attempt.session_id != payload.session_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid session credentials for submit.")

        # Idempotent submission: return existing result if already submitted or completed
        if attempt.status in ("SUBMITTED", "COMPLETED", "EXPIRED"):
            return AttemptService._format_attempt_result(attempt, attempt.test)

        if attempt.test and attempt.test.status == "PAUSED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Examination is currently paused by the administrator. Submissions are blocked while paused.",
            )

        now = datetime.now(timezone.utc)

        # Flush any final answers included in the submit payload before grading
        if payload.final_answers:
            valid_q_ids = {t.question_id for t in (attempt.test.test_questions or [])}
            for final_ans in payload.final_answers:
                if final_ans.question_id not in valid_q_ids:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Final answer references question {final_ans.question_id} which does not belong to this examination paper.",
                    )
                existing_ans = next((a for a in attempt.answers if a.question_id == final_ans.question_id), None)
                if not existing_ans:
                    existing_ans = TestAttemptAnswer(attempt_id=attempt.id, question_id=final_ans.question_id)
                    db.add(existing_ans)
                    attempt.answers.append(existing_ans)

                raw_opt = final_ans.selected_option_ids if final_ans.selected_option_ids is not None else getattr(final_ans, "selected_option_id", None)
                if raw_opt is not None:
                    if isinstance(raw_opt, (list, set, tuple)):
                        items = [str(x).strip() for x in raw_opt if str(x).strip()]
                        opt_str = (items[0] if len(items) == 1 else ",".join(items)) if items else None
                    else:
                        opt_str = str(raw_opt).strip()
                        if (opt_str.startswith("['") and opt_str.endswith("']")) or (opt_str.startswith('["') and opt_str.endswith('"]')):
                            if len(opt_str) > 4:
                                opt_str = opt_str[2:-2]
                    existing_ans.selected_option_ids = opt_str

                if final_ans.numerical_answer is not None:
                    existing_ans.numerical_answer = final_ans.numerical_answer
                if final_ans.text_answer is not None:
                    existing_ans.text_answer = final_ans.text_answer
                if final_ans.is_marked_for_review is not None:
                    existing_ans.is_marked_for_review = final_ans.is_marked_for_review
                existing_ans.answered_at = final_ans.client_timestamp or now

            db.flush()

        is_expired = bool(payload.forced_by_expiry)
        if attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            if now >= exp:
                is_expired = True

        sub_reason = "AUTO_EXPIRED" if is_expired else "MANUAL"
        AttemptService._evaluate_and_complete_attempt(db, attempt, attempt.test, is_expired=is_expired, submission_reason=sub_reason)
        return AttemptService._format_attempt_result(attempt, attempt.test)

    @staticmethod
    def get_attempt_result(
        db: Session,
        attempt_id: uuid.UUID,
        session_id: Optional[str] = None,
        is_admin: bool = False,
    ) -> AttemptResultResponse:
        attempt = db.scalar(
            select(TestAttempt)
            .options(
                selectinload(TestAttempt.answers),
                selectinload(TestAttempt.test).selectinload(Test.test_questions).selectinload(TestQuestion.question).selectinload(Question.options),
                selectinload(TestAttempt.test).selectinload(Test.subject),
            )
            .where(TestAttempt.id == attempt_id)
        )
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

        if not is_admin:
            if not session_id or (attempt.session_id and attempt.session_id != session_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access to result.")

        if attempt.status == "IN_PROGRESS":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attempt is still in progress. Please submit the examination first.",
            )

        return AttemptService._format_attempt_result(attempt, attempt.test)

    @staticmethod
    def _evaluate_and_complete_attempt(
        db: Session,
        attempt: TestAttempt,
        test: Test,
        is_expired: bool = False,
        submission_reason: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        attempt.submitted_at = now
        attempt.submission_reason = submission_reason or ("AUTO_EXPIRED" if is_expired else "MANUAL")
        if is_expired:
            attempt.status = "EXPIRED"
            attempt.expired_at = attempt.expires_at or now
        else:
            attempt.status = "COMPLETED"

        if attempt.started_at:
            st = attempt.started_at.replace(tzinfo=timezone.utc) if attempt.started_at.tzinfo is None else attempt.started_at
            attempt.time_taken_seconds = max(0, int((now - st).total_seconds()))

        # Re-compute total marks of the test from questions
        total_possible = sum(
            float(tq.marks if tq.marks is not None else (tq.question.marks if tq.question and tq.question.marks is not None else test.positive_marks))
            for tq in test.test_questions if tq.question
        )
        attempt.total_marks = round(total_possible, 2)

        answers_map = {ans.question_id: ans for ans in attempt.answers}
        total_score = 0.0
        correct_count = 0
        incorrect_count = 0
        unattempted_count = 0

        for tq in test.test_questions:
            q = tq.question
            if not q:
                continue

            pos_marks = float(tq.marks if tq.marks is not None else (q.marks if q.marks is not None else test.positive_marks))
            neg_marks = float(tq.negative_marks if tq.negative_marks is not None else (q.negative_marks if q.negative_marks is not None else test.negative_marks))

            ans = answers_map.get(q.id)
            if not ans:
                unattempted_count += 1
                continue

            # Determine whether student gave a meaningful answer
            has_option = bool(ans.selected_option_ids and ans.selected_option_ids.strip())
            has_num = ans.numerical_answer is not None
            has_text = bool(ans.text_answer and ans.text_answer.strip())

            if not (has_option or has_num or has_text):
                ans.is_correct = False
                ans.marks_awarded = 0.0
                unattempted_count += 1
                continue

            is_correct = False

            if q.question_type == "MULTIPLE_CHOICE":
                # Multi-select: all correct options must be selected and NO incorrect ones
                correct_opt_ids = {str(o.id) for o in q.options if o.is_correct}
                correct_opt_contents = {o.content.strip().lower() for o in q.options if o.is_correct}

                selected_tokens = set()
                if ans.selected_option_ids:
                    if "||" in ans.selected_option_ids:
                        selected_tokens = {x.strip() for x in ans.selected_option_ids.split("||") if x.strip()}
                    elif "," in ans.selected_option_ids:
                        selected_tokens = {x.strip() for x in ans.selected_option_ids.split(",") if x.strip()}
                    else:
                        selected_tokens = {ans.selected_option_ids.strip()}
                elif ans.text_answer:
                    selected_tokens = {x.strip() for x in ans.text_answer.split("||") if x.strip()}

                selected_lower = {t.lower() for t in selected_tokens}
                is_correct = bool(selected_tokens and (selected_tokens == correct_opt_ids or selected_lower == correct_opt_contents))

            elif q.question_type in ("MCQ", "TRUE_FALSE", "ASSERTION_REASON", "MATCH_THE_FOLLOWING"):
                # Single choice option match
                correct_opts = [o for o in q.options if o.is_correct]
                correct_opt_ids = {str(o.id) for o in correct_opts}
                correct_opt_contents = {o.content.strip().lower() for o in correct_opts}
                raw_given = (ans.selected_option_ids or ans.text_answer or "").strip()
                if (raw_given.startswith("['") and raw_given.endswith("']")) or (raw_given.startswith('["') and raw_given.endswith('"]')):
                    if len(raw_given) > 4:
                        raw_given = raw_given[2:-2]
                if "," in raw_given:
                    given_tokens = {x.strip() for x in raw_given.split(",") if x.strip()}
                elif raw_given:
                    given_tokens = {raw_given}
                else:
                    given_tokens = set()

                given_lower = {t.lower() for t in given_tokens}
                is_correct = bool(
                    given_tokens and (
                        bool(given_tokens & correct_opt_ids) or
                        bool(given_lower & correct_opt_contents)
                    )
                )

            elif q.question_type == "NUMERICAL":
                # Compare numerical answer with tolerance
                val = ans.numerical_answer
                if val is None and ans.text_answer:
                    try:
                        val = float(ans.text_answer.strip())
                    except ValueError:
                        val = None

                if val is not None and q.numerical_answer is not None:
                    target = float(q.numerical_answer)
                    tol = float(q.numerical_tolerance or 0.0)
                    is_correct = abs(val - target) <= (tol + 1e-9)
                else:
                    is_correct = False

            elif q.question_type == "FILL_BLANK":
                # Text normalized match
                given_text = (ans.text_answer or ans.selected_option_ids or "").strip().lower()
                correct_answers = []
                if q.options:
                    correct_answers.extend([o.content.strip().lower() for o in q.options if o.is_correct])
                if q.numerical_answer is not None:
                    num_val = float(q.numerical_answer)
                    num_str = str(num_val).rstrip("0").rstrip(".") if "." in str(num_val) else str(num_val)
                    correct_answers.append(num_str.lower())
                    correct_answers.append(str(q.numerical_answer).strip().lower())
                if not correct_answers and q.explanation:
                    correct_answers.append(q.explanation.strip().lower())

                is_correct = bool(given_text and any(given_text == c for c in correct_answers))

            ans.is_correct = is_correct
            if is_correct:
                ans.marks_awarded = round(pos_marks, 2)
                total_score += pos_marks
                correct_count += 1
            else:
                ans.marks_awarded = round(-neg_marks, 2)
                total_score -= neg_marks
                incorrect_count += 1

        pct = round((total_score / attempt.total_marks * 100), 2) if attempt.total_marks > 0 else 0.0
        attempt.score = round(total_score, 2)
        attempt.percentage = max(0.0, pct)
        attempt.correct_count = correct_count
        attempt.incorrect_count = incorrect_count
        attempt.unattempted_count = unattempted_count

        is_auto = is_expired or (submission_reason == "AUTO_EXPIRED")
        action = "AUTO_SUBMIT" if is_auto else "SUBMIT"
        event_type = "EXAM_AUTO_SUBMITTED" if is_auto else "EXAM_SUBMITTED"
        desc = (
            f"Exam attempt auto-submitted (Time expired) - Score: {attempt.score}/{attempt.total_marks}"
            if is_auto
            else f"Candidate '{attempt.student_name}' submitted exam - Score: {attempt.score}/{attempt.total_marks}"
        )
        try:
            AuditService.log(
                db=db,
                event_type=event_type,
                category="EXAM",
                severity="INFO",
                actor=attempt.student_name,
                actor_type="CANDIDATE",
                action=action,
                resource_type="ATTEMPT",
                resource_id=str(attempt.id),
                description=desc,
                session_id=attempt.session_id,
                details={
                    "test_id": str(test.id),
                    "score": attempt.score,
                    "total_marks": attempt.total_marks,
                    "submission_reason": attempt.submission_reason,
                },
            )
        except Exception:
            pass

        db.commit()

    @staticmethod
    def _format_attempt_result(attempt: TestAttempt, test: Test) -> AttemptResultResponse:
        show_results = (test.result_visibility == "IMMEDIATELY")
        show_answers = bool(test.show_answers) if show_results else False
        show_explanation = bool(test.show_explanation) if show_results else False

        total_questions = len(test.test_questions) if test.test_questions else 0
        correct_cnt = attempt.correct_count if attempt.correct_count is not None else 0
        incorrect_cnt = attempt.incorrect_count if attempt.incorrect_count is not None else 0
        answered_cnt = correct_cnt + incorrect_cnt
        unattempted_cnt = attempt.unattempted_count if attempt.unattempted_count is not None else max(0, total_questions - answered_cnt)
        accuracy = round((correct_cnt / answered_cnt * 100), 2) if answered_cnt > 0 else 0.0

        detailed_answers: Optional[List[AttemptQuestionResultItem]] = None

        if show_results and show_answers:
            detailed_answers = []
            # Order questions according to attempt.question_order if available, otherwise order_index
            q_order_ids = []
            if attempt.question_order:
                try:
                    q_order_ids = json.loads(attempt.question_order)
                except Exception:
                    q_order_ids = []

            tq_by_qid = {str(tq.question_id): tq for tq in test.test_questions}
            if not q_order_ids:
                sorted_tqs = sorted(test.test_questions, key=lambda x: x.order_index)
                q_order_ids = [str(tq.question_id) for tq in sorted_tqs]

            answers_map = {str(ans.question_id): ans for ans in attempt.answers}

            for idx, qid_str in enumerate(q_order_ids):
                tq = tq_by_qid.get(qid_str)
                if not tq or not tq.question:
                    continue

                q = tq.question
                pos_marks = float(tq.marks if tq.marks is not None else (q.marks if q.marks is not None else test.positive_marks))
                neg_marks = float(tq.negative_marks if tq.negative_marks is not None else (q.negative_marks if q.negative_marks is not None else test.negative_marks))

                ans = answers_map.get(qid_str)

                # Format candidate answer string
                candidate_ans_str = ""
                is_attempted = False
                if ans:
                    if q.question_type == "MULTIPLE_CHOICE":
                        selected_tokens = []
                        if ans.selected_option_ids:
                            if "||" in ans.selected_option_ids:
                                selected_tokens = [x.strip() for x in ans.selected_option_ids.split("||") if x.strip()]
                            elif "," in ans.selected_option_ids:
                                selected_tokens = [x.strip() for x in ans.selected_option_ids.split(",") if x.strip()]
                            else:
                                selected_tokens = [ans.selected_option_ids.strip()]
                        opt_map = {str(o.id): o.content for o in q.options}
                        contents = [opt_map.get(tok, tok) for tok in selected_tokens]
                        candidate_ans_str = ", ".join(contents)
                        is_attempted = bool(selected_tokens)
                    elif q.question_type in ("MCQ", "TRUE_FALSE", "ASSERTION_REASON", "MATCH_THE_FOLLOWING"):
                        opt_id = (ans.selected_option_ids or ans.text_answer or "").strip()
                        opt = next((o for o in q.options if str(o.id) == opt_id), None)
                        candidate_ans_str = opt.content if opt else opt_id
                        is_attempted = bool(candidate_ans_str)
                    elif q.question_type == "NUMERICAL":
                        if ans.numerical_answer is not None:
                            candidate_ans_str = str(ans.numerical_answer)
                            is_attempted = True
                        elif ans.text_answer:
                            candidate_ans_str = ans.text_answer.strip()
                            is_attempted = bool(candidate_ans_str)
                    else:
                        candidate_ans_str = (ans.text_answer or ans.selected_option_ids or "").strip()
                        is_attempted = bool(candidate_ans_str)

                # Format correct answer string strictly based on show_answers
                correct_ans_str: Optional[str] = None
                if show_answers:
                    if q.question_type == "MULTIPLE_CHOICE":
                        correct_opts = [o.content for o in q.options if o.is_correct]
                        correct_ans_str = ", ".join(correct_opts) if correct_opts else None
                    elif q.question_type in ("MCQ", "TRUE_FALSE", "ASSERTION_REASON", "MATCH_THE_FOLLOWING"):
                        correct_opts = [o.content for o in q.options if o.is_correct]
                        correct_ans_str = ", ".join(correct_opts) if correct_opts else None
                    elif q.question_type == "NUMERICAL":
                        correct_ans_str = str(q.numerical_answer) if q.numerical_answer is not None else None
                        if correct_ans_str and q.numerical_tolerance:
                            correct_ans_str += f" (±{float(q.numerical_tolerance)})"
                    elif q.question_type == "FILL_BLANK":
                        correct_opts = [o.content for o in q.options if o.is_correct]
                        if not correct_opts and q.numerical_answer is not None:
                            correct_opts = [str(q.numerical_answer)]
                        correct_ans_str = ", ".join(correct_opts) if correct_opts else None

                # Explanation strictly based on show_explanation
                explanation_str = q.explanation if (show_explanation and q.explanation) else None

                detailed_answers.append(
                    AttemptQuestionResultItem(
                        question_id=q.id,
                        order_index=idx + 1,
                        question_content=q.content,
                        question_type=q.question_type,
                        candidate_answer=candidate_ans_str if is_attempted else "",
                        correct_answer=correct_ans_str,
                        is_correct=ans.is_correct if (ans and is_attempted) else None,
                        marks_awarded=round(ans.marks_awarded, 2) if ans else 0.0,
                        max_marks=pos_marks,
                        negative_marks=neg_marks,
                        explanation=explanation_str,
                    )
                )

        is_auto_expired = bool(attempt.status == "EXPIRED" or attempt.submission_reason == "AUTO_EXPIRED")
        if is_auto_expired:
            message = "Time expired. Your examination was automatically submitted."
        elif show_results:
            message = "Examination submitted successfully."
        else:
            message = "Examination submitted successfully. Results will be published by the institution as per the examination schedule."

        return AttemptResultResponse(
            attempt_id=attempt.id,
            status=attempt.status,
            submission_reason=attempt.submission_reason,
            is_auto_expired=is_auto_expired,
            student_name=attempt.student_name,
            candidate_name=attempt.student_name,
            candidate_email=attempt.candidate_email,
            candidate_phone=attempt.candidate_phone,
            roll_number=attempt.roll_number,
            test_title=test.title,
            test_code=test.code,
            submitted_at=attempt.submitted_at or attempt.updated_at,
            expired_at=attempt.expired_at,
            time_taken_seconds=attempt.time_taken_seconds or 0,
            result_visibility=test.result_visibility,
            show_results=show_results,
            show_answers=show_answers,
            show_explanation=show_explanation,
            total_questions=total_questions,
            answered_count=answered_cnt,
            unanswered_count=unattempted_cnt,
            score=round(attempt.score, 2) if show_results else None,
            total_marks=round(attempt.total_marks, 2) if show_results else None,
            percentage=round(attempt.percentage, 2) if show_results else None,
            accuracy=accuracy if show_results else None,
            correct_count=correct_cnt if show_results else None,
            incorrect_count=incorrect_cnt if show_results else None,
            unattempted_count=unattempted_cnt if show_results else None,
            answers=detailed_answers,
            message=message,
        )

    @staticmethod
    def _build_session_state(db: Session, attempt: TestAttempt, test: Test) -> AttemptSessionStateResponse:
        now = datetime.now(timezone.utc)

        # Reconstruct authoritative question order
        q_order_ids = []
        if attempt.question_order:
            try:
                q_order_ids = json.loads(attempt.question_order)
            except Exception:
                q_order_ids = []

        # Map questions by ID
        tq_by_qid = {str(tq.question_id): tq for tq in test.test_questions}

        # If question_order empty or missing some, fallback to order_index
        if not q_order_ids:
            sorted_tqs = sorted(test.test_questions, key=lambda x: x.order_index)
            q_order_ids = [str(tq.question_id) for tq in sorted_tqs]

        # Parse option orders map
        option_orders_map = {}
        if attempt.option_orders:
            try:
                option_orders_map = json.loads(attempt.option_orders)
            except Exception:
                option_orders_map = {}

        questions_output: List[AttemptQuestionItem] = []
        for idx, qid_str in enumerate(q_order_ids):
            tq = tq_by_qid.get(qid_str)
            if not tq or not tq.question:
                continue

            q = tq.question
            pos_marks = float(tq.marks if tq.marks is not None else (q.marks if q.marks is not None else test.positive_marks))
            neg_marks = float(tq.negative_marks if tq.negative_marks is not None else (q.negative_marks if q.negative_marks is not None else test.negative_marks))

            # Image diagram if media exists
            image_url = None
            if q.media:
                sorted_media = sorted(q.media, key=lambda m: m.display_order)
                if sorted_media:
                    image_url = sorted_media[0].file_path

            # Order options according to stored option_orders_map
            ordered_options: List[AttemptQuestionOptionItem] = []
            if q.options:
                opt_by_id = {str(o.id): o for o in q.options}
                saved_opt_ids = option_orders_map.get(str(q.id), [])

                if saved_opt_ids:
                    for o_idx, opt_id in enumerate(saved_opt_ids):
                        opt = opt_by_id.get(opt_id)
                        if opt:
                            ordered_options.append(
                                AttemptQuestionOptionItem(
                                    id=opt.id,
                                    option_order=o_idx + 1,
                                    content=opt.content,
                                )
                            )
                else:
                    sorted_opts = sorted(q.options, key=lambda x: x.option_order)
                    for o_idx, opt in enumerate(sorted_opts):
                        ordered_options.append(
                            AttemptQuestionOptionItem(
                                id=opt.id,
                                option_order=o_idx + 1,
                                content=opt.content,
                            )
                        )

            questions_output.append(
                AttemptQuestionItem(
                    id=q.id,
                    order_index=idx + 1,
                    question_type=q.question_type,
                    content=q.content,
                    image_url=image_url,
                    marks=pos_marks,
                    negative_marks=neg_marks,
                    options=ordered_options,
                )
            )

        # Build answers dictionary and marked review list
        answers_dict: Dict[str, AttemptAnswerItem] = {}
        marked_for_review_list: List[str] = []

        for ans in attempt.answers:
            qid_str = str(ans.question_id)
            answers_dict[qid_str] = AttemptAnswerItem(
                question_id=ans.question_id,
                selected_option_ids=ans.selected_option_ids,
                numerical_answer=ans.numerical_answer,
                text_answer=ans.text_answer,
                is_marked_for_review=ans.is_marked_for_review,
                answered_at=ans.answered_at,
            )
            if ans.is_marked_for_review:
                marked_for_review_list.append(qid_str)

        time_remaining = 0
        if attempt.expires_at:
            exp = attempt.expires_at.replace(tzinfo=timezone.utc) if attempt.expires_at.tzinfo is None else attempt.expires_at
            ref_time = test.paused_at.replace(tzinfo=timezone.utc) if (test.status == "PAUSED" and test.paused_at is not None) else now
            time_remaining = max(0, int((exp - ref_time).total_seconds()))

        total_marks = sum(
            tq.marks if tq.marks is not None else (tq.question.marks if tq.question and tq.question.marks is not None else test.positive_marks)
            for tq in test.test_questions
        )

        test_info = AccessCodeVerifyResponse(
            test_id=test.id,
            title=test.title,
            code=test.code,
            description=test.description,
            instructions=test.instructions,
            topics_covered=test.topics_covered,
            subject_name=test.subject.name if test.subject else None,
            duration_minutes=test.duration_minutes,
            positive_marks=test.positive_marks,
            negative_marks=test.negative_marks,
            total_questions=len(test.test_questions),
            total_marks=round(total_marks, 2),
            allow_resume=test.allow_resume,
            result_visibility=test.result_visibility,
            status=test.status,
            start_time=test.start_time,
            end_time=test.end_time,
            server_time=now,
            server_now=now,
            is_lobby_open=False,
            starts_in_seconds=0,
            can_start=True,
        )

        return AttemptSessionStateResponse(
            attempt_id=attempt.id,
            session_id=attempt.session_id or "",
            status=attempt.status,
            candidate_name=attempt.student_name,
            candidate_email=attempt.candidate_email,
            candidate_phone=attempt.candidate_phone,
            roll_number=attempt.roll_number,
            started_at=attempt.started_at,
            expires_at=attempt.expires_at or now,
            server_time=now,
            server_now=now,
            time_remaining_seconds=time_remaining,
            remaining_seconds=time_remaining,
            current_question_index=attempt.current_question_index,
            is_paused=bool(test.status == "PAUSED"),
            submission_reason=attempt.submission_reason,
            expired_at=attempt.expired_at,
            test=test_info,
            questions=questions_output,
            answers=answers_dict,
            marked_for_review=marked_for_review_list,
        )
