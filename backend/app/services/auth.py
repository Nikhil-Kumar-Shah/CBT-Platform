import uuid
import time
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict
from sqlalchemy import select, or_, update
from sqlalchemy.orm import Session, joinedload

from backend.app.core.config import settings
from backend.app.core.security import (
    hash_password,
    verify_password,
    generate_session_token,
    hash_session_token,
)
from backend.app.core.logging import logger
from backend.app.models.user import User
from backend.app.models.session import UserSession
from backend.app.schemas.auth import UserCreate, UserUpdate

# Thread-safe in-memory session cache to eliminate redundant remote DB round-trips (TTL 120s)
# Caches session_token_hash -> (user_id: uuid.UUID, expiry_timestamp: float)
_SESSION_CACHE: Dict[str, Tuple[uuid.UUID, float]] = {}
_SESSION_CACHE_LOCK = threading.Lock()



class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass


class UserDisabledError(AuthenticationError):
    """Raised when a user account is disabled."""
    pass


class AuthService:
    @staticmethod
    def authenticate_admin(
        db: Session,
        username_or_email: str,
        password: str,
    ) -> User:
        """Authenticate an administrator or faculty member with username/email and password.

        Raises AuthenticationError on invalid credentials or non-admin/disabled status.
        Never reveals whether the username or email exists.
        """
        identifier = username_or_email.strip().lower()

        stmt = select(User).where(
            or_(
                User.username.ilike(identifier),
                User.email.ilike(identifier),
            )
        )
        user = db.scalar(stmt)

        if not user:
            logger.warning("Authentication failed: user not found")
            raise AuthenticationError("Invalid username or password")

        if not verify_password(password, user.password_hash):
            logger.warning("Authentication failed: invalid password for user_id=%s", user.id)
            raise AuthenticationError("Invalid username or password")

        if user.status != "ACTIVE":
            logger.warning("Authentication rejected: account disabled for user_id=%s", user.id)
            raise UserDisabledError("Account is disabled. Please contact administrator.")

        if not user.is_admin():
            logger.warning("Authentication rejected: unauthorized role=%s for user_id=%s", user.role, user.id)
            raise AuthenticationError("Access denied")

        # Update last login timestamp
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)

        logger.info("Admin/Faculty authentication successful for user_id=%s (role=%s)", user.id, user.role)
        return user

    @staticmethod
    def create_session(
        db: Session,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[str, datetime]:
        """Generate a secure server-side session.

        Stores only the SHA-256 hash in PostgreSQL and returns the raw session token.
        """
        raw_token = generate_session_token()
        token_hash = hash_session_token(raw_token)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=settings.SESSION_DURATION)

        session = UserSession(
            user_id=user.id,
            session_token_hash=token_hash,
            created_at=now,
            last_seen_at=now,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
        )
        db.add(session)
        db.commit()

        logger.info("Created session for user_id=%s, expires_at=%s", user.id, expires_at)
        return raw_token, expires_at

    @staticmethod
    def invalidate_session_cache(raw_token: Optional[str] = None, user_id: Optional[uuid.UUID] = None) -> None:
        """Evicts entries from the in-memory session cache."""
        with _SESSION_CACHE_LOCK:
            if raw_token:
                th = hash_session_token(raw_token)
                _SESSION_CACHE.pop(th, None)
            elif user_id:
                to_del = [k for k, (uid, _) in _SESSION_CACHE.items() if uid == user_id]
                for k in to_del:
                    _SESSION_CACHE.pop(k, None)
            else:
                _SESSION_CACHE.clear()

    @staticmethod
    def validate_session(db: Session, raw_token: str) -> Optional[User]:
        """Validate a presented raw session token with high-performance in-memory TTL cache (120s).

        Checks:
        1. Fast in-memory cache lookup for user_id (< 0.05ms)
        2. Retrieves live, attached User instance from current db Session
        3. Single query with joinedload(UserSession.user) on cache miss
        4. Session is not revoked & not expired
        5. Associated user exists and is ACTIVE
        """
        if not raw_token:
            return None

        token_hash = hash_session_token(raw_token)
        now_ts = time.time()

        # Fast in-memory cache lookup
        with _SESSION_CACHE_LOCK:
            cached = _SESSION_CACHE.get(token_hash)
            if cached:
                user_id, exp_ts = cached
                if now_ts < exp_ts:
                    user = db.get(User, user_id)
                    if user and user.status == "ACTIVE":
                        return user
                _SESSION_CACHE.pop(token_hash, None)

        now = datetime.now(timezone.utc)

        # Single query with joinedload instead of 2 sequential queries
        stmt = (
            select(UserSession)
            .options(joinedload(UserSession.user))
            .where(UserSession.session_token_hash == token_hash)
        )
        session = db.scalar(stmt)

        if not session:
            return None

        if session.revoked_at is not None:
            logger.debug("Session validation failed: session revoked")
            return None

        if session.expires_at <= now:
            logger.debug("Session validation failed: session expired")
            return None

        user = session.user
        if not user or user.status != "ACTIVE":
            logger.warning("Session validation failed: user missing or not active")
            return None

        # Cache valid user_id for 120s (or remaining session time)
        session_remaining = (session.expires_at - now).total_seconds()
        ttl = min(120.0, max(1.0, session_remaining))
        with _SESSION_CACHE_LOCK:
            _SESSION_CACHE[token_hash] = (user.id, now_ts + ttl)

        # Update last_seen_at periodically without blocking
        if (now - session.last_seen_at).total_seconds() > 300:
            session.last_seen_at = now
            try:
                db.commit()
            except Exception:
                db.rollback()

        return user

    @staticmethod
    def revoke_session(db: Session, raw_token: str) -> bool:
        """Revoke a session by raw session token."""
        if not raw_token:
            return False

        AuthService.invalidate_session_cache(raw_token=raw_token)
        token_hash = hash_session_token(raw_token)
        now = datetime.now(timezone.utc)

        stmt = (
            update(UserSession)
            .where(UserSession.session_token_hash == token_hash, UserSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        result = db.execute(stmt)
        db.commit()

        revoked = result.rowcount > 0
        if revoked:
            logger.info("Session revoked successfully")
        return revoked

    @staticmethod
    def revoke_all_user_sessions(db: Session, user_id: uuid.UUID) -> int:
        """Revoke all active sessions for a user (e.g. upon disable or password change)."""
        AuthService.invalidate_session_cache(user_id=user_id)
        now = datetime.now(timezone.utc)
        stmt = (
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        result = db.execute(stmt)
        db.commit()
        return result.rowcount

    @staticmethod
    def create_user(db: Session, data: UserCreate, actor: User) -> User:
        """Create a new user/faculty account with role enforcement."""
        from fastapi import HTTPException, status
        
        # Super admin permission checks
        target_role = data.role.upper()
        if target_role == "ADMIN" and not actor.is_super_admin():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Super Administrators can create Administrator accounts.",
            )

        # Check unique username and email (case-insensitive)
        norm_username = data.username.strip().lower()
        norm_email = data.email.strip().lower()

        existing = db.scalar(
            select(User).where(
                or_(
                    User.username.ilike(norm_username),
                    User.email.ilike(norm_email),
                )
            )
        )
        if existing:
            if existing.username.lower() == norm_username:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Username '{data.username}' is already taken.",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Email '{data.email}' is already registered.",
                )

        new_user = User(
            username=data.username.strip(),
            email=data.email.strip().lower(),
            display_name=data.display_name.strip(),
            password_hash=hash_password(data.password),
            role=target_role,
            status="ACTIVE",
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        logger.info("User created: username=%s, role=%s, created_by=%s", new_user.username, new_user.role, actor.username)
        return new_user

    @staticmethod
    def list_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
        """List all users/faculty accounts."""
        stmt = select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
        return list(db.scalars(stmt).all())

    @staticmethod
    def update_user(db: Session, user_id: uuid.UUID, data: UserUpdate, actor: User) -> User:
        """Update an existing user account."""
        from fastapi import HTTPException, status

        target_user = db.get(User, user_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        # If modifying an ADMIN account, require super admin
        if target_user.role == "ADMIN" and not actor.is_super_admin() and target_user.id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify Super Administrator account.",
            )

        # Cannot demote or disable own account
        if target_user.id == actor.id:
            if data.status and data.status != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You cannot deactivate your own account.",
                )
            if data.role and data.role != target_user.role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You cannot modify your own role.",
                )

        if data.role:
            target_role = data.role.upper()
            if target_role == "ADMIN" and not actor.is_super_admin():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Super Administrators can promote users to Administrator.",
                )
            target_user.role = target_role

        if data.display_name:
            target_user.display_name = data.display_name.strip()

        if data.email:
            norm_email = data.email.strip().lower()
            if norm_email != target_user.email.lower():
                dup = db.scalar(select(User).where(User.email.ilike(norm_email), User.id != user_id))
                if dup:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Email '{data.email}' is already in use.",
                    )
                target_user.email = norm_email

        if data.status:
            target_user.status = data.status
            if data.status != "ACTIVE":
                AuthService.revoke_all_user_sessions(db, target_user.id)

        if data.password:
            target_user.password_hash = hash_password(data.password)
            AuthService.revoke_all_user_sessions(db, target_user.id)

        db.commit()
        db.refresh(target_user)
        logger.info("User updated: id=%s, modified_by=%s", user_id, actor.username)
        return target_user

    @staticmethod
    def change_password(db: Session, user: User, current_password: str, new_password: str) -> User:
        """Allows an authenticated user to securely change their own password.

        Verifies current password with Argon2id, persists the new Argon2id hash,
        revokes prior active sessions for zero-trust hygiene, and commits to PostgreSQL.
        Returns the refreshed, attached User model instance.
        """
        from fastapi import HTTPException, status

        logger.info("Admin password update requested for user_id=%s (%s)", getattr(user, "id", None), getattr(user, "username", None))

        if not current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required.",
            )

        # Defensive lookup: ensure user is attached to current database session
        user_id = getattr(user, "id", None)
        target_user = db.get(User, user_id) if user_id else None
        if not target_user:
            target_user = user

        if not verify_password(current_password, target_user.password_hash):
            logger.warning("Admin password change rejected: incorrect current password for user_id=%s", target_user.id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password.",
            )

        if not new_password or len(new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 8 characters long.",
            )

        # Hash with Argon2id
        target_user.password_hash = hash_password(new_password)

        # Invalidate active sessions to prevent stale session persistence
        revoked_count = AuthService.revoke_all_user_sessions(db, target_user.id)

        # Commit and refresh
        db.commit()
        db.refresh(target_user)

        logger.info("Admin password update committed successfully for user_id=%s (%s), revoked %d active session(s)", target_user.id, target_user.username, revoked_count)
        return target_user

