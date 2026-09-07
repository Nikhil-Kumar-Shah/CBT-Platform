from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models.user import User
from backend.app.services.auth import AuthService


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Dependency to retrieve and validate the currently authenticated user from the session cookie or Authorization header."""
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user = AuthService.validate_session(db, token)
    if not user:
        try:
            from backend.app.services.audit_service import AuditService
            from backend.app.core.rate_limit import get_client_ip
            AuditService.log(
                db=db,
                event_type="AUTHENTICATION_FAILURE",
                category="SECURITY",
                severity="WARNING",
                actor="Anonymous",
                actor_type="UNKNOWN",
                action="VALIDATE_SESSION",
                resource_type="ENDPOINT",
                resource_id=request.url.path,
                description=f"Unauthorized request with invalid or expired session token on {request.url.path}",
                ip_address=get_client_ip(request),
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or revoked session",
        )

    return user


def require_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Dependency that ensures the authenticated user is an ACTIVE administrator or faculty member."""
    if not current_user.is_admin() or not current_user.is_active():
        try:
            from backend.app.services.audit_service import AuditService
            from backend.app.core.rate_limit import get_client_ip
            AuditService.log(
                db=db,
                event_type="AUTHORIZATION_FAILURE",
                category="SECURITY",
                severity="WARNING",
                actor=current_user.username,
                actor_type="USER",
                action="REQUIRE_ADMIN",
                resource_type="ENDPOINT",
                resource_id=request.url.path,
                description=f"Forbidden access attempt to admin endpoint: {request.url.path}",
                ip_address=get_client_ip(request),
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator or faculty access required",
        )
    return current_user


def require_super_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Dependency that ensures the authenticated user is an ACTIVE Super Administrator."""
    if not current_user.is_super_admin() or not current_user.is_active():
        try:
            from backend.app.services.audit_service import AuditService
            from backend.app.core.rate_limit import get_client_ip
            AuditService.log(
                db=db,
                event_type="AUTHORIZATION_FAILURE",
                category="SECURITY",
                severity="WARNING",
                actor=current_user.username,
                actor_type="USER",
                action="REQUIRE_SUPER_ADMIN",
                resource_type="ENDPOINT",
                resource_id=request.url.path,
                description=f"Forbidden access attempt to super-admin endpoint: {request.url.path}",
                ip_address=get_client_ip(request),
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Administrator access required",
        )
    return current_user


def get_optional_admin(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Safely retrieves current user if an authenticated admin session is active, else returns None."""
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        return None

    user = AuthService.validate_session(db, token)
    if user and user.is_admin() and user.is_active():
        return user
    return None

