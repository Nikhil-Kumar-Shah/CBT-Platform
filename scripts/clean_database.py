#!/usr/bin/env python3
"""
CBT Platform — Database Cleanup & Wipe Utility
==============================================================================
Cleans examination, question, test-series, subject, attempt, and audit data
from the database.

Supports two operational modes:
  1. Default Mode: Cleans all exam data while STRICTLY PRESERVING user accounts.
  2. Full Wipe Mode (--include-users / --all): Cleans EVERYTHING, including all
     user profiles and administrator accounts, in safe foreign key dependency order.

Usage:
  python scripts/clean_database.py [OPTIONS]

Options:
  --include-users, --all   COMPLETE WIPE: Delete all data AND all user accounts
  --preserve-users         Keep user profiles intact (default behavior)
  --clear-sessions         Also delete user login session tokens
  --keep-audit             Preserve the universal audit log (audit_events)
  --dry-run                Preview record counts without performing any deletions
  --force, -y              Bypass interactive confirmation prompt
==============================================================================
"""

import sys
import os
import argparse
from pathlib import Path

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


def clean_database(
    include_users: bool = False,
    dry_run: bool = False,
    force: bool = False,
    clear_sessions: bool = False,
    keep_audit: bool = False,
):
    print("\n" + "=" * 68)
    print(f" {BOLD}{BRIGHT_CYAN}CBT PLATFORM — DATABASE CLEANUP & WIPE TOOL{RESET}")
    print("=" * 68)
    print(f" {GRAY}Execution Mode: {BRIGHT_YELLOW if dry_run else BRIGHT_RED}{'DRY RUN (Preview Only)' if dry_run else 'ACTIVE DELETION'}{RESET}")
    if include_users:
        print(f" {GRAY}Target Scope:   {BOLD}{BRIGHT_RED}COMPLETE WIPE (ALL EXAMS + ALL USER PROFILES WILL BE DELETED){RESET}\n")
    else:
        print(f" {GRAY}Target Scope:   {BRIGHT_GREEN}EXAM DATA ONLY (USER PROFILES ARE PRESERVED){RESET}\n")

    db = SessionLocal()
    try:
        # 1. Fetch current counts across all tables
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

        if clear_sessions or include_users:
            counts["User Sessions"] = db.scalar(select(func.count(UserSession.id))) or 0

        if include_users:
            counts["User Accounts (ALL)"] = db.scalar(select(func.count(User.id))) or 0

        # Query existing users
        existing_users = db.scalars(select(User).order_by(User.role, User.username)).all()

        # Display Data to be cleared
        print(f"{BOLD}{BRIGHT_WHITE}Database Inventory & Records to Clean:{RESET}")
        print("-" * 55)
        total_records_to_clean = sum(counts.values())
        for label, cnt in counts.items():
            print(format_row(label, cnt))
        print("-" * 55)
        print(f"  {BOLD}{WHITE}{'TOTAL RECORDS TO PURGE':<35}{RESET} : {BOLD}{BRIGHT_YELLOW if total_records_to_clean > 0 else GRAY}{total_records_to_clean:>8}{RESET}\n")

        # Display user information
        if include_users:
            print(f"{BOLD}{BRIGHT_RED}User Accounts that WILL BE PERMANENTLY DELETED ({len(existing_users)} Users):{RESET}")
            print("-" * 68)
            for u in existing_users:
                role_badge = f"{BRIGHT_RED}[{u.role}]{RESET}"
                print(f"  • {BOLD}{u.username:<18}{RESET} {u.email:<30} {role_badge}")
            print("-" * 68 + "\n")
        else:
            print(f"{BOLD}{BRIGHT_GREEN}User Profiles to PRESERVE ({len(existing_users)} Users):{RESET}")
            print("-" * 68)
            for u in existing_users:
                role_badge = f"{BRIGHT_YELLOW}[{u.role}]{RESET}"
                status_badge = f"{BRIGHT_GREEN}{u.status}{RESET}"
                print(f"  • {BOLD}{u.username:<18}{RESET} {u.email:<30} {role_badge:<18} ({status_badge})")
            print("-" * 68 + "\n")

        if total_records_to_clean == 0:
            print(f"{BRIGHT_GREEN}Database is already clean! No records found matching the scope.{RESET}\n")
            return 0

        if dry_run:
            print(f"{BRIGHT_YELLOW}[DRY RUN] No records were deleted. Run without --dry-run to execute.{RESET}\n")
            return 0

        # Confirmation prompt
        if not force:
            if include_users:
                print(f"{BOLD}{BRIGHT_RED}DANGER / CAUTION:{RESET} This will permanently delete {BOLD}EVERYTHING{RESET} including {BOLD}ALL USER PROFILES{RESET}.")
                print(f"Foreign key constraints on 'tests' and 'attempts' will be safely cleared first.")
                print(f"After this, you will need to re-create an administrator with: {BOLD}python scripts/create_admin_cli.py{RESET}")
                confirm = input(f"\nType {BOLD}'DELETE ALL'{RESET} to proceed with full database wipe: ").strip()
                if confirm != "DELETE ALL":
                    print(f"\n{YELLOW}Wipe aborted. Confirmation phrase did not match. No changes made.{RESET}\n")
                    return 1
            else:
                print(f"{BOLD}{BRIGHT_RED}WARNING:{RESET} This will permanently delete {BOLD}{total_records_to_clean:,}{RESET} examination and academic records.")
                print(f"All tests, questions, subjects, test series, and candidate attempts will be deleted.")
                print(f"User accounts and login credentials will {BOLD}NOT{RESET} be deleted.")
                confirm = input(f"\nAre you sure you want to proceed? Type {BOLD}'yes'{RESET} to confirm: ").strip().lower()
                if confirm != "yes":
                    print(f"\n{YELLOW}Cleanup cancelled by user. No changes were made.{RESET}\n")
                    return 1

        print(f"\n{CYAN}Executing deletion in safe foreign key dependency order...{RESET}")

        # Order of deletion to strictly respect foreign key constraints:
        # (Resolves: foreign key constraint "tests_created_by_fkey" on table "tests")
        # 1. attempt_integrity_events   (references attempts)
        # 2. test_attempt_answers       (references attempts, questions, options)
        # 3. test_attempts              (references tests, users)
        # 4. test_audit_logs            (references tests, users)
        # 5. test_questions             (references tests, questions)
        # 6. tests                      (references test_series, subjects, users - clears tests_created_by_fkey!)
        # 7. test_series                (references subjects, users)
        # 8. question_options           (references questions)
        # 9. question_media             (references questions)
        # 10. questions                 (references subjects, topics, users)
        # 11. topics                    (references subjects)
        # 12. subjects                  (references users)
        # 13. audit_events              (optional system audit log)
        # 14. user_sessions             (references users)
        # 15. users                     (only if include_users=True - now has 0 remaining dependencies!)

        # Try fast cascade truncate first if dialect is PostgreSQL and include_users is True
        try:
            if include_users and not keep_audit:
                db.execute(text("""
                    TRUNCATE TABLE 
                        attempt_integrity_events,
                        test_attempt_answers,
                        test_attempts,
                        test_audit_logs,
                        test_questions,
                        tests,
                        test_series,
                        question_options,
                        question_media,
                        questions,
                        topics,
                        subjects,
                        audit_events,
                        user_sessions,
                        users
                    CASCADE;
                """))
            else:
                # Safe sequential execution
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

                if clear_sessions or include_users:
                    db.execute(delete(UserSession))

                if include_users:
                    db.execute(delete(User))

            db.commit()

        except Exception as cascade_err:
            db.rollback()
            # Sequential fallback with explicit foreign key dependency order
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
            if clear_sessions or include_users:
                db.execute(delete(UserSession))
            if include_users:
                db.execute(delete(User))
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

        print(f"\n{BRIGHT_GREEN}SUCCESS! Database cleanup completed successfully.{RESET}")
        print("=" * 68)
        print(f"  • Remaining Tests:     {remaining_tests}")
        print(f"  • Remaining Questions: {remaining_questions}")
        print(f"  • Remaining Subjects:  {remaining_subjects}")
        if include_users:
            print(f"  • Remaining Users:     {BOLD}{BRIGHT_YELLOW}{remaining_users}{RESET} (All user accounts purged)")
            print(f"\n{BRIGHT_CYAN}Notice:{RESET} To create a fresh administrator account, run:")
            print(f"  {BOLD}python scripts/create_admin_cli.py{RESET}")
        else:
            print(f"  • Preserved Users:     {BOLD}{BRIGHT_GREEN}{remaining_users}{RESET} (All user profiles intact)")
        print("=" * 68 + "\n")

        return 0

    except Exception as e:
        db.rollback()
        print(f"\n{BRIGHT_RED}ERROR: Failed to clean database: {e}{RESET}\n", file=sys.stderr)
        return 2
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Clean or wipe the CBT Database safely without foreign key constraint errors.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--include-users",
        "--all",
        action="store_true",
        help="COMPLETE WIPE: Delete all examination data AND all user profiles",
    )
    parser.add_argument(
        "--preserve-users",
        action="store_true",
        help="Keep user accounts intact (default behavior)",
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
        help="Also purge user login session tokens",
    )
    parser.add_argument(
        "--keep-audit",
        action="store_true",
        help="Preserve the system-wide universal audit log",
    )

    args = parser.parse_args()

    include_users = False
    if args.include_users:
        include_users = True
    elif args.preserve-users if hasattr(args, "preserve_users") and args.preserve_users else False:
        include_users = False
    elif not args.force and not args.dry_run and sys.stdin.isatty():
        # Interactive scope selection
        print("\n" + "=" * 68)
        print(f" {BOLD}{BRIGHT_CYAN}CBT PLATFORM — DATABASE CLEANUP SCOPE SELECTION{RESET}")
        print("=" * 68)
        print(" Please choose the cleanup scope:")
        print(f"  {BOLD}[1]{RESET} Clean exam data, attempts & questions ({BRIGHT_GREEN}PRESERVE user profiles{RESET}) [Default]")
        print(f"  {BOLD}[2]{RESET} {BOLD}{BRIGHT_RED}COMPLETE WIPE:{RESET} Delete all exam data {BOLD}AND all user accounts{RESET}")
        print("=" * 68)
        choice = input("Enter choice [1 or 2, default 1]: ").strip()
        if choice == "2":
            include_users = True
        else:
            include_users = False

    code = clean_database(
        include_users=include_users,
        dry_run=args.dry_run,
        force=args.force,
        clear_sessions=args.clear_sessions,
        keep_audit=args.keep_audit,
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
