#!/usr/bin/env python3
"""
CBT Platform — Database Cleanup Utility
==============================================================================
Cleans all examination, question, test-series, subject, attempt, and audit data
from the database while strictly PRESERVING all User profiles and accounts.

Usage:
  python scripts/clean_database.py [OPTIONS]

Options:
  --dry-run          Preview records to be deleted without performing changes
  --force, -y        Bypass interactive confirmation prompt
  --clear-sessions   Also delete user session tokens (logs out active users)
  --keep-audit       Preserve the universal audit log (audit_events)
==============================================================================
"""

import sys
import os
import argparse
from pathlib import Path

# Add project root to sys.path
# Force UTF-8 on Windows consoles to prevent encoding glitches
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from sqlalchemy import select, func, text, delete
from backend.app.core.database import SessionLocal, engine
from backend.app.models.user import User
from backend.app.models.session import UserSession
from backend.app.models.subject import Subject
from backend.app.models.topic import Topic
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.question_media import QuestionMedia
from backend.app.models.test_series import TestSeries
from backend.app.models.test import Test
from backend.app.models.test_question import TestQuestion
from backend.app.models.test_audit_log import TestAuditLog
from backend.app.models.test_attempt import TestAttempt, TestAttemptAnswer
from backend.app.models.attempt_integrity_event import AttemptIntegrityEvent
from backend.app.models.audit_log import AuditEvent

# ANSI Colors
BOLD = "\033[1m"
RESET = "\033[0m"
GREEN = "\033[32m"
BRIGHT_GREEN = "\033[92m"
YELLOW = "\033[33m"
BRIGHT_YELLOW = "\033[93m"
CYAN = "\033[36m"
BRIGHT_CYAN = "\033[96m"
RED = "\033[31m"
BRIGHT_RED = "\033[91m"
WHITE = "\033[37m"
BRIGHT_WHITE = "\033[97m"
GRAY = "\033[90m"


def format_row(label: str, count: int, width: int = 35) -> str:
    count_str = f"{count:,}" if count > 0 else "0"
    color = BRIGHT_YELLOW if count > 0 else GRAY
    return f"  {WHITE}{label:<{width}}{RESET} : {color}{count_str:>8}{RESET} records"


def clean_database(dry_run: bool = False, force: bool = False, clear_sessions: bool = False, keep_audit: bool = False):
    print("\n" + "=" * 65)
    print(f" {BOLD}{BRIGHT_CYAN}CBT PLATFORM — DATABASE CLEANUP TOOL{RESET}")
    print("=" * 65)
    print(f" {GRAY}Mode: {BRIGHT_YELLOW if dry_run else BRIGHT_RED}{'DRY RUN (Preview Only)' if dry_run else 'ACTIVE DELETION'}{RESET}")
    print(f" {GRAY}User Profiles Policy: {BRIGHT_GREEN}STRICTLY PRESERVED (NO USERS DELETED){RESET}\n")

    db = SessionLocal()
    try:
        # 1. Fetch current counts
        counts = {
            "Attempt Integrity Events": db.scalar(select(func.count(AttemptIntegrityEvent.id))) or 0,
            "Test Attempt Answers": db.scalar(select(func.count(TestAttemptAnswer.id))) or 0,
            "Test Attempts": db.scalar(select(func.count(TestAttempt.id))) or 0,
            "Test Audit Logs": db.scalar(select(func.count(TestAuditLog.id))) or 0,
            "Test Questions (Links)": db.scalar(select(func.count(TestQuestion.id))) or 0,
            "Tests / Examinations": db.scalar(select(func.count(Test.id))) or 0,
            "Test Series": db.scalar(select(func.count(TestSeries.id))) or 0,
            "Question Options": db.scalar(select(func.count(QuestionOption.id))) or 0,
            "Question Media": db.scalar(select(func.count(QuestionMedia.id))) or 0,
            "Questions": db.scalar(select(func.count(Question.id))) or 0,
            "Topics": db.scalar(select(func.count(Topic.id))) or 0,
            "Subjects": db.scalar(select(func.count(Subject.id))) or 0,
        }

        if not keep_audit:
            counts["Universal Audit Events"] = db.scalar(select(func.count(AuditEvent.id))) or 0

        if clear_sessions:
            counts["User Sessions"] = db.scalar(select(func.count(UserSession.id))) or 0

        # Query preserved users
        preserved_users = db.scalars(select(User).order_by(User.role, User.username)).all()

        # Display Data to be cleared
        print(f"{BOLD}{BRIGHT_WHITE}Data Records Found to Clean:{RESET}")
        print("-" * 50)
        total_data_records = sum(counts.values())
        for label, cnt in counts.items():
            print(format_row(label, cnt))
        print("-" * 50)
        print(f"  {BOLD}{WHITE}{'TOTAL DATA RECORDS TO CLEAN':<35}{RESET} : {BOLD}{BRIGHT_YELLOW if total_data_records > 0 else GRAY}{total_data_records:>8}{RESET}\n")

        # Display Preserved Users
        print(f"{BOLD}{BRIGHT_GREEN}User Profiles to PRESERVE ({len(preserved_users)} Users):{RESET}")
        print("-" * 65)
        for u in preserved_users:
            role_badge = f"{BRIGHT_YELLOW}[{u.role}]{RESET}"
            status_badge = f"{BRIGHT_GREEN}{u.status}{RESET}"
            print(f"  • {BOLD}{u.username:<18}{RESET} {u.email:<30} {role_badge:<18} ({status_badge})")
        print("-" * 65 + "\n")

        if total_data_records == 0:
            print(f"{BRIGHT_GREEN}Database data is already clean! No test or question data found.{RESET}\n")
            return 0

        if dry_run:
            print(f"{BRIGHT_YELLOW}[DRY RUN] No records were deleted. Run without --dry-run to execute.{RESET}\n")
            return 0

        # Confirmation prompt
        if not force:
            print(f"{BOLD}{BRIGHT_RED}WARNING:{RESET} This operation will permanently delete {BOLD}{total_data_records:,}{RESET} data records.")
            print(f"All tests, questions, subjects, test series, and candidate attempts will be deleted.")
            print(f"User accounts and login credentials will {BOLD}NOT{RESET} be deleted.")
            confirm = input(f"\nAre you sure you want to proceed? Type {BOLD}'yes'{RESET} to confirm: ").strip().lower()
            if confirm != "yes":
                print(f"\n{YELLOW}Cleanup cancelled by user. No changes were made.{RESET}\n")
                return 1

        print(f"\n{CYAN}Executing deletion in safe dependency order...{RESET}")

        # Order of deletion to respect foreign keys:
        # 1. Attempt Integrity Events
        # 2. Test Attempt Answers
        # 3. Test Attempts
        # 4. Test Audit Logs
        # 5. Test Questions
        # 6. Tests
        # 7. Test Series
        # 8. Question Options
        # 9. Question Media
        # 10. Questions
        # 11. Topics
        # 12. Subjects
        # 13. Audit Events (if not keep_audit)
        # 14. Sessions (if clear_sessions)

        db.execute(delete(AttemptIntegrityEvent))
        db.execute(delete(TestAttemptAnswer))
        db.execute(delete(TestAttempt))
        db.execute(delete(TestAuditLog))
        db.execute(delete(TestQuestion))
        db.execute(delete(Test))
        db.execute(delete(TestSeries))
        db.execute(delete(QuestionOption))
        db.execute(delete(QuestionMedia))
        db.execute(delete(Question))
        db.execute(delete(Topic))
        db.execute(delete(Subject))

        if not keep_audit:
            db.execute(delete(AuditEvent))

        if clear_sessions:
            db.execute(delete(UserSession))

        db.commit()

        # Invalidate in-memory caches
        try:
            from backend.app.api.v1.subjects import invalidate_subjects_cache
            invalidate_subjects_cache()
        except Exception:
            pass

        try:
            from backend.app.api.v1.test_series import invalidate_series_cache
            invalidate_series_cache()
        except Exception:
            pass

        try:
            from backend.app.api.v1.tests import invalidate_tests_cache
            invalidate_tests_cache()
        except Exception:
            pass

        try:
            from backend.app.services.dashboard_service import DashboardService
            DashboardService.invalidate_cache()
        except Exception:
            pass

        # Verify final counts
        remaining_users = db.scalar(select(func.count(User.id))) or 0
        remaining_tests = db.scalar(select(func.count(Test.id))) or 0
        remaining_questions = db.scalar(select(func.count(Question.id))) or 0
        remaining_subjects = db.scalar(select(func.count(Subject.id))) or 0

        print(f"{BRIGHT_GREEN}SUCCESS! Database data cleanup completed successfully.{RESET}")
        print("=" * 65)
        print(f"  • Remaining Tests:     {remaining_tests}")
        print(f"  • Remaining Questions: {remaining_questions}")
        print(f"  • Remaining Subjects:  {remaining_subjects}")
        print(f"  • Preserved Users:     {BOLD}{BRIGHT_GREEN}{remaining_users}{RESET} (All user profiles intact)")
        print("=" * 65 + "\n")

        return 0

    except Exception as e:
        db.rollback()
        print(f"\n{BRIGHT_RED}ERROR: Failed to clean database: {e}{RESET}\n", file=sys.stderr)
        return 2
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Clean all examination and academic data from CBT Database while preserving User profiles.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview record counts without deleting anything",
    )
    parser.add_argument(
        "--force",
        "-y",
        action="store_true",
        help="Execute immediately without interactive confirmation",
    )
    parser.add_argument(
        "--clear-sessions",
        action="store_true",
        help="Also purge user sessions (logs out all active sessions)",
    )
    parser.add_argument(
        "--keep-audit",
        action="store_true",
        help="Preserve the system-wide universal audit log",
    )

    args = parser.parse_args()
    code = clean_database(
        dry_run=args.dry_run,
        force=args.force,
        clear_sessions=args.clear_sessions,
        keep_audit=args.keep_audit,
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
