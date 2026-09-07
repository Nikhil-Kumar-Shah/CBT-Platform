from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.logging import logger
from backend.app.core.rate_limit import rate_limit
from backend.app.models.user import User
from backend.app.schemas.auth import (
    LoginRequest,
    UserResponse,
    UserCreate,
    UserUpdate,
    PasswordChangeRequest,
    MessageResponse,
)
from backend.app.services.auth import AuthService, AuthenticationError, UserDisabledError
from backend.app.services.audit_service import AuditService
from backend.app.api.deps import require_admin, require_super_admin, get_current_user
import uuid
from typing import List

router = APIRouter(prefix="/auth", tags=["Authentication"])

login_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_LOGIN_PER_MINUTE,
    key_prefix="admin_login",
)


@router.post(
    "/login",
    response_model=UserResponse,
    summary="Admin Login",
    description="Authenticates an administrator and establishes a secure server-side session via HttpOnly cookie.",
    dependencies=[Depends(login_limiter)],
)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    try:
        user = AuthService.authenticate_admin(
            db=db,
            username_or_email=payload.username_or_email,
            password=payload.password,
        )
    except UserDisabledError:
        AuditService.log(
            db=db,
            event_type="AUTH_FAILURE",
            category="SECURITY",
            severity="WARNING",
            actor=payload.username_or_email,
            actor_type="ANONYMOUS",
            action="LOGIN_FAILED",
            description=f"Login attempt rejected: account is disabled for '{payload.username_or_email}'",
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or account disabled",
        )
    except AuthenticationError:
        AuditService.log(
            db=db,
            event_type="AUTH_FAILURE",
            category="SECURITY",
            severity="WARNING",
            actor=payload.username_or_email,
            actor_type="ANONYMOUS",
            action="LOGIN_FAILED",
            description=f"Failed administrator login attempt for identifier '{payload.username_or_email}'",
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Extract client IP and user agent
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    raw_token, expires_at = AuthService.create_session(
        db=db,
        user=user,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    # Set secure HttpOnly session cookie
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=settings.SESSION_DURATION,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        path="/",
    )

    AuditService.log(
        db=db,
        event_type="ADMIN_LOGIN",
        category="ADMIN",
        severity="INFO",
        actor=user.username,
        actor_type="ADMIN",
        action="LOGIN",
        resource_type="USER",
        resource_id=str(user.id),
        description=f"Administrator '{user.username}' signed in successfully",
        ip_address=client_ip,
    )

    return user


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Admin Logout",
    description="Revokes the active server-side session and clears the session cookie.",
)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if token:
        user = AuthService.validate_session(db, token)
        actor_name = user.username if user else "Administrator"
        AuthService.revoke_session(db, token)
        AuditService.log(
            db=db,
            event_type="ADMIN_LOGOUT",
            category="ADMIN",
            severity="INFO",
            actor=actor_name,
            actor_type="ADMIN",
            action="LOGOUT",
            description=f"Administrator '{actor_name}' signed out",
            ip_address=request.client.host if request.client else None,
        )

    # Delete session cookie
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )

    return MessageResponse(message="Logged out successfully")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Current Admin/Faculty Profile",
    description="Returns the profile information of the currently authenticated administrator or faculty member.",
)
def get_me(current_user: User = Depends(require_admin)):
    return current_user


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change Own Password",
    description="Allows the authenticated user to safely change their own password and refreshes their session.",
)
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated_user = AuthService.change_password(
        db=db,
        user=current_user,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    
    # Establish a fresh secure session for the current client while all previous sessions remain revoked
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    raw_token, _ = AuthService.create_session(
        db=db,
        user=updated_user,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=settings.SESSION_DURATION,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        path="/",
    )

    AuditService.log(
        db=db,
        event_type="PASSWORD_CHANGE",
        category="SECURITY",
        severity="INFO",
        actor=updated_user.username,
        actor_type="USER",
        action="CHANGE_PASSWORD",
        resource_type="USER",
        resource_id=str(updated_user.id),
        description=f"User '{updated_user.username}' changed their password",
        ip_address=client_ip,
    )
    return MessageResponse(message="Password changed successfully.")


@router.get(
    "/users",
    response_model=List[UserResponse],
    summary="List Faculty & Admin Accounts",
    description="Returns all registered faculty, professor, and administrator accounts.",
)
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin),
):
    return AuthService.list_users(db=db, skip=skip, limit=limit)


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Faculty/Professor Account",
    description="Allows authorized administrators to create new professor, teacher, or admin accounts.",
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    new_user = AuthService.create_user(db=db, data=payload, actor=current_user)
    AuditService.log(
        db=db,
        event_type="USER_CREATED",
        category="ADMIN",
        severity="INFO",
        actor=current_user.username,
        actor_type="ADMIN",
        action="CREATE_USER",
        resource_type="USER",
        resource_id=str(new_user.id),
        description=f"Created user account '{new_user.username}' with role '{new_user.role}'",
    )
    return new_user


@router.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Update User Account",
    description="Allows authorized administrators to update user status, role, email, display name, or password.",
)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    updated_user = AuthService.update_user(
        db=db,
        user_id=user_id,
        data=payload,
        actor=current_user,
    )
    AuditService.log(
        db=db,
        event_type="USER_UPDATED",
        category="ADMIN",
        severity="INFO",
        actor=current_user.username,
        actor_type="ADMIN",
        action="UPDATE_USER",
        resource_type="USER",
        resource_id=str(updated_user.id),
        description=f"Updated user account '{updated_user.username}'",
    )
    return updated_user
