"""Interactive / CLI Admin Creation Tool for CBT Platform.

Safely creates an administrator account in the production PostgreSQL 'cbt' database.
Preserves existing admin accounts and hashes passwords using bcrypt.
"""

import sys
import argparse
from pathlib import Path

# Add workspace root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.core.database import SessionLocal
from backend.app.core.security import hash_password
from backend.app.models.user import User
from sqlalchemy import select


def create_admin(username: str, email: str, password: str, display_name: str = "System Administrator") -> int:
    """Creates an admin account if username doesn't exist.
    
    Returns:
        0 on successful creation
        1 if admin already exists (safe idempotent abort)
        2 on validation / runtime error
    """
    username = username.strip()
    email = email.strip()
    password = password.strip()

    if not username:
        print("ERROR: Username cannot be empty.", file=sys.stderr)
        return 2
    if not password or len(password) < 8:
        print("ERROR: Password must be at least 8 characters long.", file=sys.stderr)
        return 2
    if not email or "@" not in email:
        print("ERROR: Please provide a valid email address.", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        existing_user = db.scalar(select(User).where((User.username == username) | (User.email == email)))
        if existing_user:
            if existing_user.username == username:
                print(f"An admin account with username '{username}' already exists. No changes were made.")
            else:
                print(f"An account with email '{email}' already exists. No changes were made.")
            return 1

        new_admin = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            display_name=display_name or f"Admin ({username})",
            role="ADMIN",
            status="ACTIVE",
        )
        db.add(new_admin)
        db.commit()
        print(f"SUCCESS: Administrator account '{username}' created successfully.")
        return 0
    except Exception as exc:
        db.rollback()
        # Clean safe error message without credentials
        print(f"ERROR: Failed to create administrator account: {exc}", file=sys.stderr)
        return 2
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Create a CBT Platform Administrator Account")
    parser.add_argument("--username", help="Admin username")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--password", help="Admin password (prefer interactive prompt)")
    parser.add_argument("--display-name", default="System Administrator", help="Display name")
    args = parser.parse_args()

    if args.username and args.email and args.password:
        code = create_admin(args.username, args.email, args.password, args.display_name)
        sys.exit(code)

    # Interactive mode
    print("\n" + "=" * 55)
    print(" CBT PLATFORM - ADMINISTRATOR ACCOUNT CREATION")
    print("=" * 55 + "\n")

    username = input("Enter admin username: ").strip()
    if not username:
        print("Aborted: Username required.", file=sys.stderr)
        sys.exit(2)

    email = input(f"Enter admin email [{username}@cbt.local]: ").strip()
    if not email:
        email = f"{username}@cbt.local"

    import getpass
    pwd1 = getpass.getpass("Enter secure password (min 8 chars): ")
    if len(pwd1) < 8:
        print("Aborted: Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(2)

    pwd2 = getpass.getpass("Confirm secure password: ")
    if pwd1 != pwd2:
        print("Aborted: Passwords do not match.", file=sys.stderr)
        sys.exit(2)

    display_name = input("Enter display name [System Administrator]: ").strip()
    if not display_name:
        display_name = "System Administrator"

    code = create_admin(username, email, pwd1, display_name)
    sys.exit(code)


if __name__ == "__main__":
    main()
