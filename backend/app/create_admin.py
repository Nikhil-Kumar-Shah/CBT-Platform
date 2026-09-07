import argparse
import getpass
import sys
from sqlalchemy import select, or_

from backend.app.core.database import SessionLocal
from backend.app.core.security import hash_password
from backend.app.core.logging import setup_logging, logger
from backend.app.models.user import User


def create_admin(username: str, email: str, password: str, display_name: str) -> bool:
    """Create an administrator user securely."""
    setup_logging()

    if not username or len(username) < 3:
        print("Error: Username must be at least 3 characters long.", file=sys.stderr)
        return False

    if not email or "@" not in email:
        print("Error: A valid email address is required.", file=sys.stderr)
        return False

    if not password or len(password) < 6:
        print("Error: Password must be at least 6 characters long.", file=sys.stderr)
        return False

    display_name = display_name or username

    with SessionLocal() as db:
        # Check existing user
        stmt = select(User).where(
            or_(
                User.username.ilike(username.strip()),
                User.email.ilike(email.strip()),
            )
        )
        existing = db.scalar(stmt)
        if existing:
            print(
                f"Error: A user with username '{username}' or email '{email}' already exists.",
                file=sys.stderr,
            )
            return False

        hashed_pwd = hash_password(password)
        admin_user = User(
            username=username.strip(),
            email=email.strip().lower(),
            password_hash=hashed_pwd,
            display_name=display_name.strip(),
            role="ADMIN",
            status="ACTIVE",
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print(f"Admin user '{admin_user.username}' ({admin_user.email}) created successfully with ID: {admin_user.id}")
        return True


def main():
    parser = argparse.ArgumentParser(description="Create a CBT Platform Administrator account.")
    parser.add_argument("--username", help="Admin username")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--password", help="Admin password (if omitted, will prompt securely)")
    parser.add_argument("--display-name", help="Admin display name")

    args = parser.parse_args()

    username = args.username
    if not username:
        username = input("Enter admin username: ").strip()

    email = args.email
    if not email:
        email = input("Enter admin email: ").strip()

    display_name = args.display_name
    if not display_name:
        display_name = input("Enter admin display name (optional, press enter to use username): ").strip() or username

    password = args.password
    if not password:
        password = getpass.getpass("Enter admin password: ")
        password_confirm = getpass.getpass("Confirm admin password: ")
        if password != password_confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    success = create_admin(
        username=username,
        email=email,
        password=password,
        display_name=display_name,
    )
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
