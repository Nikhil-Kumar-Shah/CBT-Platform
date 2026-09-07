from fastapi import APIRouter

from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.subjects import router as subjects_router
from backend.app.api.v1.topics import router as topics_router
from backend.app.api.v1.media import router as media_router
from backend.app.api.v1.questions import router as questions_router
from backend.app.api.v1.test_series import router as test_series_router
from backend.app.api.v1.tests import router as tests_router
from backend.app.api.v1.dashboard import router as dashboard_router
from backend.app.api.v1.attempts import router as attempts_router
from backend.app.api.v1.audit import router as audit_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(subjects_router)
api_v1_router.include_router(topics_router)
api_v1_router.include_router(media_router)
api_v1_router.include_router(questions_router)
api_v1_router.include_router(test_series_router)
api_v1_router.include_router(tests_router)
api_v1_router.include_router(dashboard_router)
api_v1_router.include_router(attempts_router)
api_v1_router.include_router(audit_router)


