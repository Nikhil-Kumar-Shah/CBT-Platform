import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status, Response
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.rate_limit import rate_limit
from backend.app.models.user import User
from backend.app.api.deps import require_admin
from backend.app.schemas.test import (
    TestCreate,
    TestUpdate,
    TestResponse,
    TestListResponse,
    TestQuestionSyncRequest,
    InlineQuestionCreate,
    BatchInlineQuestionCreate,
    TestRescheduleRequest,
    TestCancelRequest,
)
from backend.app.schemas.test_audit import TestAuditLogResponse
from backend.app.schemas.analytics import TestAnalyticsResponse, StudentSubmissionDetail
from backend.app.services.test_service import TestService
from backend.app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/tests", tags=["Tests"])

csv_export_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_CSV_EXPORT_PER_MINUTE,
    key_prefix="csv_export",
)



import time
from typing import Dict, Tuple

_TESTS_LIST_CACHE: Dict[Tuple, Tuple[float, TestListResponse]] = {}
_TESTS_LIST_CACHE_TTL: float = 15.0

_TEST_DETAIL_CACHE: Dict[uuid.UUID, Tuple[float, TestResponse]] = {}
_TEST_DETAIL_CACHE_TTL: float = 15.0

_AUDIT_LOG_CACHE: Dict[uuid.UUID, Tuple[float, list[TestAuditLogResponse]]] = {}
_AUDIT_LOG_CACHE_TTL: float = 15.0

def invalidate_tests_cache(test_id: Optional[uuid.UUID] = None):
    _TESTS_LIST_CACHE.clear()
    if test_id:
        _TEST_DETAIL_CACHE.pop(test_id, None)
        _AUDIT_LOG_CACHE.pop(test_id, None)
    else:
        _TEST_DETAIL_CACHE.clear()
        _AUDIT_LOG_CACHE.clear()
    try:
        from backend.app.services.dashboard_service import DashboardService
        DashboardService.invalidate_cache()
    except Exception:
        pass


@router.get("", response_model=TestListResponse)
def list_tests(
    status: Optional[str] = Query(None),
    series_id: Optional[uuid.UUID] = Query(None),
    subject_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cache_key = (status, series_id, subject_id, search, page, page_size)
    now_ts = time.time()
    if cache_key in _TESTS_LIST_CACHE:
        cached_time, cached_res = _TESTS_LIST_CACHE[cache_key]
        if now_ts - cached_time < _TESTS_LIST_CACHE_TTL:
            return cached_res

    items, total = TestService.list_tests(
        db=db,
        status_filter=status,
        series_id=series_id,
        subject_id=subject_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    formatted = [TestService.to_response(t, include_questions=False) for t in items]
    res = TestListResponse(items=formatted, total=total, page=page, page_size=page_size)
    _TESTS_LIST_CACHE[cache_key] = (now_ts, res)
    return res


@router.post("", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def create_test(
    payload: TestCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.create_test(db, payload, admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.get("/{id}", response_model=TestResponse)
def get_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    now_ts = time.time()
    if id in _TEST_DETAIL_CACHE:
        cached_time, cached_res = _TEST_DETAIL_CACHE[id]
        if now_ts - cached_time < _TEST_DETAIL_CACHE_TTL:
            return cached_res

    test = TestService.get_test(db, id)
    res = TestService.to_response(test)
    _TEST_DETAIL_CACHE[id] = (now_ts, res)
    return res


@router.patch("/{id}", response_model=TestResponse)
def update_test(
    id: uuid.UUID,
    payload: TestUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.update_test(db, id, payload, user_id=admin.id)
    invalidate_tests_cache(id)
    return TestService.to_response(test)


@router.delete("/{id}", response_model=TestResponse)
def archive_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.archive_test(db, id, user_id=admin.id)
    invalidate_tests_cache(id)
    return TestService.to_response(test)


@router.put("/{id}/questions", response_model=TestResponse)
def sync_test_questions(
    id: uuid.UUID,
    payload: TestQuestionSyncRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.sync_questions(db, id, payload.questions, user_id=admin.id)
    invalidate_tests_cache(id)
    return TestService.to_response(test)


@router.post("/{id}/questions/inline", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def add_question_inline(
    id: uuid.UUID,
    payload: InlineQuestionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.add_question_inline(db, id, payload, admin.id)
    invalidate_tests_cache(id)
    return TestService.to_response(test)


@router.post("/{id}/questions/batch", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def batch_add_questions_inline(
    id: uuid.UUID,
    payload: BatchInlineQuestionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.batch_add_questions_inline(db, id, payload.questions, admin.id)
    invalidate_tests_cache(id)
    return TestService.to_response(test)


@router.put("/{id}/questions/{question_id}", response_model=TestResponse)
@router.put("/{id}/questions/{question_id}/inline", response_model=TestResponse)
def update_question_inline(
    id: uuid.UUID,
    question_id: uuid.UUID,
    payload: InlineQuestionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.update_question_inline(db, id, question_id, payload, admin.id)
    invalidate_tests_cache(id)
    return TestService.to_response(test)


@router.get("/{id}/audit-logs", response_model=list[TestAuditLogResponse])
def get_test_audit_logs(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    now_ts = time.time()
    if id in _AUDIT_LOG_CACHE:
        cached_time, cached_res = _AUDIT_LOG_CACHE[id]
        if now_ts - cached_time < _AUDIT_LOG_CACHE_TTL:
            return cached_res

    res = TestService.get_audit_logs(db, id)
    _AUDIT_LOG_CACHE[id] = (now_ts, res)
    return res


@router.get("/{id}/analytics", response_model=TestAnalyticsResponse)
def get_test_analytics(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return AnalyticsService.get_test_analytics(db, id)


@router.post("/{id}/publish", response_model=TestResponse)
def publish_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.publish_test(db, id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/duplicate", response_model=TestResponse)
def duplicate_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.duplicate_test(db, id, admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/complete", response_model=TestResponse)
def complete_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.complete_test(db, id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/conclude", response_model=TestResponse)
def conclude_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.complete_test(db, id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/reschedule", response_model=TestResponse)
@router.post("/{id}/schedule", response_model=TestResponse)
def reschedule_test(
    id: uuid.UUID,
    payload: TestRescheduleRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.reschedule_test(
        db=db,
        test_id=id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        user_id=admin.id,
    )
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/unschedule", response_model=TestResponse)
def unschedule_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.unschedule_test(db=db, test_id=id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/pause", response_model=TestResponse)
def pause_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.pause_test(db=db, test_id=id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/resume", response_model=TestResponse)
def resume_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.resume_test(db=db, test_id=id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/cancel", response_model=TestResponse)
def cancel_test(
    id: uuid.UUID,
    payload: TestCancelRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.cancel_test(
        db=db,
        test_id=id,
        user_id=admin.id,
        reason=payload.reason,
    )
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.post("/{id}/restore", response_model=TestResponse)
def restore_test(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.restore_test(db, id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.delete("/{id}/questions/{question_id}", response_model=TestResponse)
def remove_question_from_test(
    id: uuid.UUID,
    question_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    test = TestService.remove_question_from_test(db, id, question_id, user_id=admin.id)
    invalidate_tests_cache()
    return TestService.to_response(test)


@router.get(
    "/{id}/results/export/csv",
    dependencies=[Depends(csv_export_limiter)],
)
def export_students_csv(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Export finalized and active candidate attempt results in UTF-8 CSV format."""
    test = TestService.get_test(db, id)
    csv_content = AnalyticsService.generate_students_csv(db, id)
    safe_code = "".join(c for c in (test.code or "test") if c.isalnum() or c in "-_")
    filename = f"{safe_code}_candidate_results.csv"
    return Response(
        content=csv_content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{id}/questions/export/csv",
    dependencies=[Depends(csv_export_limiter)],
)
def export_questions_csv(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Export item-level question performance & difficulty analysis in UTF-8 CSV format."""
    test = TestService.get_test(db, id)
    csv_content = AnalyticsService.generate_questions_csv(db, id)
    safe_code = "".join(c for c in (test.code or "test") if c.isalnum() or c in "-_")
    filename = f"{safe_code}_question_analysis.csv"
    return Response(
        content=csv_content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/attempts/{attempt_id}/detail", response_model=StudentSubmissionDetail)
def get_student_submission_detail(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return AnalyticsService.get_student_submission_detail(db, attempt_id)

