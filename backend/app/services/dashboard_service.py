import uuid
import time
from typing import Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy import select, func, distinct
from sqlalchemy.orm import Session, selectinload

from backend.app.models.test import Test
from backend.app.models.test_series import TestSeries
from backend.app.models.question import Question
from backend.app.models.test_question import TestQuestion
from backend.app.models.test_attempt import TestAttempt
from backend.app.schemas.dashboard import (
    DashboardStatsResponse,
    RecentTestItem,
    RecentActivityItem,
)

_LAST_DASHBOARD_RECONCILE_AT: float = 0.0
_DASHBOARD_CACHE: Optional[Tuple[float, DashboardStatsResponse]] = None
_DASHBOARD_CACHE_TTL: float = 15.0


class DashboardService:
    @staticmethod
    def invalidate_cache():
        global _DASHBOARD_CACHE
        _DASHBOARD_CACHE = None

    @staticmethod
    def get_stats(db: Session) -> DashboardStatsResponse:
        global _DASHBOARD_CACHE, _LAST_DASHBOARD_RECONCILE_AT
        now_ts = time.time()

        if _DASHBOARD_CACHE is not None:
            cached_time, cached_res = _DASHBOARD_CACHE
            if now_ts - cached_time < _DASHBOARD_CACHE_TTL:
                return cached_res

        now = datetime.now(timezone.utc)

        # Proactively reconcile tests (throttled to at most once per 60s)
        if now_ts - _LAST_DASHBOARD_RECONCILE_AT > 60.0:
            _LAST_DASHBOARD_RECONCILE_AT = now_ts
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

        # 1. Consolidated Test counts query (1 round-trip instead of 5)
        test_counts = db.execute(
            select(
                func.count(Test.id).filter(Test.status != "ARCHIVED").label("total_tests"),
                func.count(Test.id).filter(Test.status.in_(["LIVE", "PUBLISHED"])).label("live_tests"),
                func.count(Test.id).filter(Test.status == "SCHEDULED").label("scheduled_tests"),
                func.count(Test.id).filter(Test.status == "DRAFT").label("draft_tests"),
                func.count(Test.id).filter(Test.status.in_(["COMPLETED", "CLOSED"])).label("completed_tests"),
            )
        ).one()

        total_tests = test_counts.total_tests or 0
        live_tests = test_counts.live_tests or 0
        scheduled_tests = test_counts.scheduled_tests or 0
        draft_tests = test_counts.draft_tests or 0
        completed_tests = test_counts.completed_tests or 0

        # 2. Consolidated Attempt & candidate counts query (1 round-trip instead of 3)
        attempt_counts = db.execute(
            select(
                func.count(TestAttempt.id).label("total_attempts"),
                func.count(distinct(TestAttempt.student_name)).label("total_candidates"),
                func.count(TestAttempt.id).filter(
                    TestAttempt.status.in_(["SUBMITTED", "COMPLETED", "EXPIRED"])
                ).label("total_submissions"),
            )
        ).one()

        total_attempts = attempt_counts.total_attempts or 0
        total_candidates = attempt_counts.total_candidates or 0
        total_submissions = attempt_counts.total_submissions or 0

        # 3. Simple counts
        total_questions = db.scalar(select(func.count(Question.id)).where(Question.status == "ACTIVE")) or 0
        total_series = db.scalar(select(func.count(TestSeries.id)).where(TestSeries.status != "ARCHIVED")) or 0

        # Tests requiring attention (Draft or Scheduled with 0 questions)
        tests_with_questions = select(TestQuestion.test_id).distinct()
        needs_attention = db.scalar(
            select(func.count(Test.id)).where(
                Test.status.in_(["DRAFT", "SCHEDULED"]),
                ~Test.id.in_(tests_with_questions),
            )
        ) or 0

        # Recent tests (single query with eager loads)
        recent_tests_db = list(
            db.scalars(
                select(Test)
                .options(
                    selectinload(Test.test_series),
                    selectinload(Test.test_questions),
                    selectinload(Test.attempts),
                )
                .where(Test.status != "ARCHIVED")
                .order_by(Test.created_at.desc())
                .limit(5)
            ).all()
        )

        recent_tests = [
            RecentTestItem(
                id=t.id,
                title=t.title,
                code=t.code,
                series_name=t.test_series.name if t.test_series else None,
                status=t.status,
                question_count=len(t.test_questions) if t.test_questions else 0,
                attempts_count=len(t.attempts) if t.attempts else 0,
                created_at=t.created_at,
            )
            for t in recent_tests_db
        ]

        recent_activity = []
        for t in recent_tests_db[:4]:
            recent_activity.append(
                RecentActivityItem(
                    id=f"test-{t.id}",
                    type="TEST_CREATED" if t.status == "DRAFT" else "TEST_PUBLISHED",
                    title=f"Test '{t.title}' ({t.code})",
                    description=f"Status: {t.status} • {len(t.test_questions) if t.test_questions else 0} Questions",
                    timestamp=t.updated_at or t.created_at,
                )
            )

        res = DashboardStatsResponse(
            total_tests=total_tests,
            published_tests=live_tests,
            draft_tests=draft_tests,
            closed_tests=completed_tests,
            total_attempts=total_attempts,
            total_questions=total_questions,
            total_series=total_series,
            live_tests=live_tests,
            scheduled_tests=scheduled_tests,
            completed_tests=completed_tests,
            total_candidates=total_candidates,
            total_submissions=total_submissions,
            needs_attention=needs_attention,
            recent_tests=recent_tests,
            recent_activity=recent_activity,
        )

        _DASHBOARD_CACHE = (now_ts, res)
        return res
