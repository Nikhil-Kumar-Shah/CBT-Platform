import uuid
import re
from typing import List, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status

from backend.app.models.test_series import TestSeries
from backend.app.models.test import Test
from backend.app.schemas.test_series import TestSeriesCreate, TestSeriesUpdate


class TestSeriesService:
    @staticmethod
    def generate_code(name: str, db: Session) -> str:
        """Generate a unique human-readable code for the series (e.g., JEE-PHY-SERIES-1)."""
        base = re.sub(r"[^A-Z0-9]+", "-", name.upper().strip()).strip("-")
        if not base:
            base = "SERIES"
        base = base[:30]
        code = base
        counter = 1
        while db.scalar(select(func.count(TestSeries.id)).where(TestSeries.code == code)) > 0:
            code = f"{base}-{counter}"
            counter += 1
        return code

    @staticmethod
    def create_series(db: Session, data: TestSeriesCreate, user_id: uuid.UUID) -> TestSeries:
        code = data.code.strip().upper() if data.code else TestSeriesService.generate_code(data.name, db)
        # Check code uniqueness
        existing = db.scalar(select(TestSeries).where(TestSeries.code == code))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Test series with code '{code}' already exists.",
            )

        series = TestSeries(
            name=data.name.strip(),
            code=code,
            description=data.description.strip() if data.description else None,
            thumbnail_url=data.thumbnail_url,
            status=data.status,
            created_by=user_id,
        )
        db.add(series)
        db.commit()
        db.refresh(series)
        return series

    @staticmethod
    def get_series(db: Session, series_id: uuid.UUID) -> TestSeries:
        series = db.scalar(
            select(TestSeries)
            .options(
                selectinload(TestSeries.tests).selectinload(Test.test_questions),
                selectinload(TestSeries.tests).selectinload(Test.subject),
            )
            .where(TestSeries.id == series_id)
        )
        if not series:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test series not found.")
        return series

    @staticmethod
    def list_series(
        db: Session,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[TestSeries], int]:
        query = select(TestSeries).options(
            selectinload(TestSeries.tests).selectinload(Test.test_questions),
            selectinload(TestSeries.tests).selectinload(Test.subject),
        )

        if status_filter and status_filter != "ALL":
            query = query.where(TestSeries.status == status_filter)
        else:
            query = query.where(TestSeries.status != "ARCHIVED")

        if search:
            s = f"%{search.strip()}%"
            query = query.where(TestSeries.name.ilike(s) | TestSeries.code.ilike(s))

        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = list(
            db.scalars(
                query.order_by(TestSeries.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return items, total

    @staticmethod
    def update_series(db: Session, series_id: uuid.UUID, data: TestSeriesUpdate) -> TestSeries:
        series = TestSeriesService.get_series(db, series_id)

        if data.name is not None:
            series.name = data.name.strip()
        if data.code is not None:
            new_code = data.code.strip().upper()
            if new_code != series.code:
                existing = db.scalar(select(TestSeries).where(TestSeries.code == new_code))
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Test series with code '{new_code}' already exists.",
                    )
                series.code = new_code
        if data.description is not None:
            series.description = data.description.strip() if data.description else None
        if data.thumbnail_url is not None:
            series.thumbnail_url = data.thumbnail_url
        if data.status is not None:
            series.status = data.status

        db.commit()
        db.refresh(series)
        return series

    @staticmethod
    def archive_series(db: Session, series_id: uuid.UUID) -> TestSeries:
        series = TestSeriesService.get_series(db, series_id)
        series.status = "ARCHIVED"
        db.commit()
        db.refresh(series)
        return series

    @staticmethod
    def add_test_to_series(db: Session, series_id: uuid.UUID, test_id: uuid.UUID) -> TestSeries:
        series = TestSeriesService.get_series(db, series_id)
        test = db.scalar(select(Test).where(Test.id == test_id))
        if not test:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found.")
        test.test_series_id = series_id
        next_order = max([(t.series_order or 0) for t in (series.tests or [])], default=0) + 1
        test.series_order = next_order
        db.commit()
        db.refresh(series)
        return series

    @staticmethod
    def remove_test_from_series(db: Session, series_id: uuid.UUID, test_id: uuid.UUID) -> TestSeries:
        series = TestSeriesService.get_series(db, series_id)
        test = db.scalar(select(Test).where(Test.id == test_id, Test.test_series_id == series_id))
        if test:
            test.test_series_id = None
            db.commit()
            db.refresh(series)
        return series

    @staticmethod
    def reorder_tests_in_series(db: Session, series_id: uuid.UUID, test_ids: List[uuid.UUID]) -> TestSeries:
        series = TestSeriesService.get_series(db, series_id)
        current_map = {t.id: t for t in (series.tests or [])}
        for idx, t_id in enumerate(test_ids, start=1):
            if t_id in current_map:
                current_map[t_id].series_order = idx
        db.commit()
        db.refresh(series)
        return series
