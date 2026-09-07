import time
from collections import defaultdict
from typing import Callable, Dict, List
from fastapi import HTTPException, Request, status

from backend.app.core.config import settings
from backend.app.core.logging import logger


class InMemoryRateLimiter:
    """Lightweight in-memory sliding window rate limiter.

    Tracks request timestamps per client IP. Automatically prunes timestamps older
    than the sliding window (60 seconds) on each request.
    """

    def __init__(self, requests_per_minute: int, key_prefix: str = "default"):
        self.requests_per_minute = requests_per_minute
        self.key_prefix = key_prefix
        self.window_seconds = 60
        self._requests: Dict[str, List[float]] = defaultdict(list)

    def _clean_and_count(self, key: str, now: float) -> int:
        cutoff = now - self.window_seconds
        # Keep only timestamps within the current sliding window
        valid = [t for t in self._requests[key] if t > cutoff]
        self._requests[key] = valid
        return len(valid)

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        key = f"{self.key_prefix}:{client_ip}"
        count = self._clean_and_count(key, now)

        if count >= self.requests_per_minute:
            return False

        self._requests[key].append(now)
        return True

    def reset(self) -> None:
        """Reset internal memory tracker (primarily for testing)."""
        self._requests.clear()


def get_client_ip(request: Request) -> str:
    """Extract client IP respecting X-Forwarded-For if behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(requests_per_minute: int, key_prefix: str = "default") -> Callable:
    """FastAPI dependency for rate limiting an endpoint by client IP address."""
    limiter = InMemoryRateLimiter(requests_per_minute=requests_per_minute, key_prefix=key_prefix)

    async def dependency(request: Request) -> None:
        # If running automated tests, bypass rate limit unless explicitly testing rate limits
        if settings.TESTING and not getattr(request.state, "test_rate_limit", False):
            return

        client_ip = get_client_ip(request)

        if not limiter.is_allowed(client_ip):
            logger.warning(
                "Rate limit exceeded for prefix '%s' by client IP %s on %s %s",
                key_prefix,
                client_ip,
                request.method,
                request.url.path,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Limit is {requests_per_minute} per minute. Please wait before trying again.",
                headers={"Retry-After": "60"},
            )

    # Attach limiter instance to dependency for testing and inspection
    dependency.limiter = limiter  # type: ignore[attr-defined]
    return dependency


class FailedAttemptTracker:
    """Tracks consecutive failed actions (such as access-code verification) per client IP.

    If failures exceed max_failures within window_seconds, the IP is temporarily
    throttled for lockout_seconds without permanently locking candidates out.
    """

    def __init__(
        self,
        max_failures: int = 10,
        window_seconds: int = 300,
        lockout_seconds: int = 120,
    ):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._failures: Dict[str, List[float]] = defaultdict(list)
        self._locked_until: Dict[str, float] = {}

    def is_locked(self, client_ip: str) -> tuple[bool, int]:
        now = time.time()
        locked_until = self._locked_until.get(client_ip, 0.0)
        if locked_until > now:
            return True, int(locked_until - now) + 1
        return False, 0

    def record_failure(self, client_ip: str) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - self.window_seconds
        valid = [t for t in self._failures[client_ip] if t > cutoff]
        valid.append(now)
        self._failures[client_ip] = valid

        if len(valid) >= self.max_failures:
            self._locked_until[client_ip] = now + self.lockout_seconds
            return True, self.lockout_seconds
        return False, 0

    def record_success(self, client_ip: str) -> None:
        self._failures.pop(client_ip, None)
        self._locked_until.pop(client_ip, None)

    def reset(self) -> None:
        self._failures.clear()
        self._locked_until.clear()


access_code_tracker = FailedAttemptTracker(
    max_failures=settings.ACCESS_CODE_MAX_FAILED_ATTEMPTS,
    lockout_seconds=settings.ACCESS_CODE_LOCKOUT_SECONDS,
)

