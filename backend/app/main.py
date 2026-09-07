from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.logging import setup_logging, logger
from backend.app.api.v1.router import api_v1_router

# Initialize application logging
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s in %s mode", settings.APP_NAME, settings.APP_ENV)
    from backend.app.core.config import validate_storage_configuration
    validate_storage_configuration()
    
    # Auto-bootstrap PostgreSQL database if necessary
    try:
        from backend.app.core.db_bootstrap import bootstrap_postgres_database
        bootstrap_postgres_database(raise_on_failure=not settings.TESTING)
    except Exception as exc:
        logger.warning("Database auto-bootstrap encountered error on startup: %s", exc)
        if not settings.TESTING:
            raise

    try:
        from sqlalchemy import text
        from backend.app.core.database import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("PostgreSQL database connection verified successfully.")
    except Exception as exc:
        logger.warning("Database connectivity check failed on startup (%s). Ensure PostgreSQL is running and accessible.", exc)
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Session-ID",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
)


import time

@app.middleware("http")
async def add_timing_and_security_headers(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time_ms = (time.perf_counter() - start_time) * 1000
    response.headers["X-Process-Time-Ms"] = f"{process_time_ms:.1f}ms"

    # Apply standard production security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'self'; object-src 'none';"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # Log structured, informative access line with exact latency in milliseconds
    path_with_query = request.url.path
    if request.url.query:
        path_with_query += f"?{request.url.query}"
    logger.info(f'ACCESS: "{request.method} {path_with_query}" {response.status_code} in {process_time_ms:.1f}ms')
    return response


# Root health convenience redirects / endpoints for reverse proxies
@app.get("/health", include_in_schema=False)
def root_health(db=Depends(get_db)):
    from backend.app.api.v1.health import health_liveness
    return health_liveness(db=db)


@app.get("/health/database", include_in_schema=False)
def root_health_database(db=Depends(get_db)):
    from backend.app.api.v1.health import health_database
    return health_database(db=db)


@app.get("/health/ready", include_in_schema=False)
def root_health_ready(db=Depends(get_db)):
    from backend.app.api.v1.health import health_readiness
    return health_readiness(db=db)



# Mount API v1 router
app.include_router(api_v1_router, prefix="/api/v1")


from sqlalchemy.exc import OperationalError as SQLAlchemyOperationalError


@app.exception_handler(SQLAlchemyOperationalError)
async def db_operational_exception_handler(request: Request, exc: SQLAlchemyOperationalError):
    logger.error("Database connection failure at %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Service is temporarily unavailable. Please try again in a few moments."},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler that logs detailed errors server-side

    without leaking internal implementation details or stack traces to the client.
    """
    logger.exception("Unhandled server exception at %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )

