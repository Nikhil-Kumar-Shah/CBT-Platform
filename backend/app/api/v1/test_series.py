import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.models.user import User
from backend.app.api.deps import require_admin
from backend.app.schemas.test_series import (
    TestSeriesCreate,
    TestSeriesUpdate,
    TestSeriesResponse,
    TestSeriesListResponse,
    TestSummaryInSeries,
    TestSeriesReorderRequest,
)
from backend.app.services.test_series_service import TestSeriesService

router = APIRouter(prefix="/test-series", tags=["Test Series"])


def _format_series(s) -> TestSeriesResponse:
    valid_tests = [t for t in (s.tests or []) if t.status != "ARCHIVED"]
    valid_tests.sort(key=lambda x: (x.series_order if x.series_order is not None else 999999, x.created_at))
    tests = []
    for t in valid_tests:
        tot_marks = sum(
            (tq.marks if tq.marks is not None else t.positive_marks)
            for tq in (t.test_questions or [])
        )
        display_status = t.status
        if display_status == "PUBLISHED":
            display_status = "LIVE"
        elif display_status == "CLOSED":
            display_status = "COMPLETED"

        tests.append(
            TestSummaryInSeries(
                id=t.id,
                title=t.title,
                code=t.code,
                duration_minutes=t.duration_minutes,
                status=display_status,
                series_order=t.series_order or 1,
                subject_name=t.subject.name if t.subject else None,
                total_marks=tot_marks,
                question_count=len(t.test_questions) if t.test_questions else 0,
                created_at=t.created_at,
            )
        )
    pub_count = sum(1 for t in tests if t.status in ("LIVE", "PUBLISHED"))
    return TestSeriesResponse(
        id=s.id,
        name=s.name,
        code=s.code,
        description=s.description,
        thumbnail_url=s.thumbnail_url,
        status=s.status,
        created_by=s.created_by,
        created_at=s.created_at,
        updated_at=s.updated_at,
        test_count=len(tests),
        published_test_count=pub_count,
        total_attempts=0,
        tests=tests,
    )


import time
from typing import Dict, Tuple

_SERIES_CACHE: Dict[Tuple[Optional[str], Optional[str], int, int], Tuple[float, TestSeriesListResponse]] = {}
_SERIES_CACHE_TTL: float = 30.0

def invalidate_series_cache():
    _SERIES_CACHE.clear()


@router.get("", response_model=TestSeriesListResponse)
def list_test_series(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cache_key = (status, search, page, page_size)
    now_ts = time.time()
    if cache_key in _SERIES_CACHE:
        cached_time, cached_res = _SERIES_CACHE[cache_key]
        if now_ts - cached_time < _SERIES_CACHE_TTL:
            return cached_res

    items, total = TestSeriesService.list_series(
        db=db,
        status_filter=status,
        search=search,
        page=page,
        page_size=page_size,
    )
    formatted = [_format_series(s) for s in items]
    res = TestSeriesListResponse(items=formatted, total=total, page=page, page_size=page_size)
    _SERIES_CACHE[cache_key] = (now_ts, res)
    return res


@router.post("", response_model=TestSeriesResponse, status_code=status.HTTP_201_CREATED)
def create_test_series(
    payload: TestSeriesCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.create_series(db, payload, admin.id)
    invalidate_series_cache()
    return _format_series(series)


@router.get("/{id}", response_model=TestSeriesResponse)
def get_test_series(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.get_series(db, id)
    return _format_series(series)


@router.patch("/{id}", response_model=TestSeriesResponse)
def update_test_series(
    id: uuid.UUID,
    payload: TestSeriesUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.update_series(db, id, payload)
    invalidate_series_cache()
    return _format_series(series)


@router.delete("/{id}", response_model=TestSeriesResponse)
def archive_test_series(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.archive_series(db, id)
    invalidate_series_cache()
    return _format_series(series)


@router.post("/{id}/tests/{test_id}", response_model=TestSeriesResponse)
def add_test_to_series(
    id: uuid.UUID,
    test_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.add_test_to_series(db, id, test_id)
    invalidate_series_cache()
    return _format_series(series)


@router.delete("/{id}/tests/{test_id}", response_model=TestSeriesResponse)
def remove_test_from_series(
    id: uuid.UUID,
    test_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.remove_test_from_series(db, id, test_id)
    invalidate_series_cache()
    return _format_series(series)


@router.put("/{id}/tests/reorder", response_model=TestSeriesResponse)
def reorder_tests_in_series(
    id: uuid.UUID,
    payload: TestSeriesReorderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    series = TestSeriesService.reorder_tests_in_series(db, id, payload.test_ids)
    invalidate_series_cache()
    return _format_series(series)
