"""Ensure the default admin user exists with the documented password."""
import sys
sys.path.insert(0, ".")

from backend.app.core.database import SessionLocal
from backend.app.core.security import hash_password, verify_password
from backend.app.models.user import User
from sqlalchemy import select

db = SessionLocal()
try:
    user = db.scalar(select(User).where(User.username == "admin"))
    pwd = "AdminSecure123!"

    if not user:
        user = User(
            username="admin",
            email="admin@cbt.local",
            password_hash=hash_password(pwd),
            display_name="System Administrator",
            role="ADMIN",
            status="ACTIVE",
        )
        db.add(user)
        db.commit()
        print("STATUS:CREATED")
    else:
        # User exists: NEVER overwrite or reset custom passwords on startup/restart
        print("STATUS:EXISTS")
finally:
    db.close()
