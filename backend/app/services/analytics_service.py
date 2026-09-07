import csv
import io
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status

from backend.app.models.test import Test
from backend.app.models.test_attempt import TestAttempt, TestAttemptAnswer
from backend.app.models.test_question import TestQuestion
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.attempt_integrity_event import AttemptIntegrityEvent
from backend.app.services.integrity_service import IntegrityService
from backend.app.schemas.analytics import (
    TestAnalyticsResponse,
    ScoreDistributionBucket,
    QuestionPerformanceItem,
    OptionDistributionItem,
    StudentSubmissionSummary,
    StudentSubmissionDetail,
    StudentAnswerDetail,
)


class AnalyticsService:
    @staticmethod
    def get_test_analytics(db: Session, test_id: uuid.UUID) -> TestAnalyticsResponse:
        db.expire_all()
        test = db.scalar(
            select(Test)
            .options(
                selectinload(Test.subject),
                selectinload(Test.test_questions)
                .selectinload(TestQuestion.question)
                .selectinload(Question.options),
                selectinload(Test.attempts).selectinload(TestAttempt.answers),
            )
            .where(Test.id == test_id)
        )
        if not test:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found.")

        attempts = [a for a in test.attempts if a.status in ("SUBMITTED", "COMPLETED")]
        total_participants = len(test.attempts)
        completed_submissions = len(attempts)
        in_progress_count = sum(1 for a in test.attempts if a.status == "IN_PROGRESS")
        expired_count = sum(1 for a in test.attempts if a.status == "EXPIRED")
        not_started_count = max(0, total_participants - completed_submissions - in_progress_count - expired_count)

        scores = [a.score for a in attempts]
        percentages = [a.percentage for a in attempts]
        times = [a.time_taken_seconds for a in attempts]

        avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
        highest_score = max(scores) if scores else 0.0
        lowest_score = min(scores) if scores else 0.0

        # Median
        if scores:
            sorted_scores = sorted(scores)
            mid = len(sorted_scores) // 2
            median_score = (
                sorted_scores[mid]
                if len(sorted_scores) % 2 != 0
                else round((sorted_scores[mid - 1] + sorted_scores[mid]) / 2.0, 2)
            )
        else:
            median_score = 0.0

        avg_percentage = round(sum(percentages) / len(percentages), 1) if percentages else 0.0
        avg_time = int(sum(times) / len(times)) if times else 0
        completion_rate = round((completed_submissions / total_participants * 100), 1) if total_participants > 0 else 0.0
        submission_rate = completion_rate

        # Calculate average candidate accuracy across all submitted attempts:
        # sum(correct) / sum(attempted) * 100
        total_correct_all = sum(a.correct_count for a in attempts)
        total_attempted_all = sum((a.correct_count + a.incorrect_count) for a in attempts)
        avg_accuracy = (
            round((total_correct_all / total_attempted_all * 100), 1)
            if total_attempted_all > 0
            else 0.0
        )

        # Score distribution buckets: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%
        bucket_defs = [
            ("0-20%", 0, 20),
            ("20-40%", 20, 40),
            ("40-60%", 40, 60),
            ("60-80%", 60, 80),
            ("80-100%", 80, 101),
        ]
        distribution: List[ScoreDistributionBucket] = []
        for label, low, high in bucket_defs:
            count = sum(1 for p in percentages if low <= p < high)
            pct = round((count / len(percentages) * 100), 1) if percentages else 0.0
            distribution.append(ScoreDistributionBucket(range_label=label, count=count, percentage=pct))

        # Calculate dynamic test total marks and questions
        sorted_test_questions = sorted(test.test_questions, key=lambda tq: tq.order_index)
        total_q_count = len(sorted_test_questions)
        dynamic_total_marks = 0.0
        for tq in sorted_test_questions:
            q_marks = tq.marks if tq.marks is not None else (tq.question.marks if tq.question else test.positive_marks)
            dynamic_total_marks += float(q_marks or 0.0)

        # Question Performance & Option Distribution
        q_perf_list: List[QuestionPerformanceItem] = []
        for tq in sorted_test_questions:
            q = tq.question
            if not q:
                continue

            q_max_marks = float(tq.marks if tq.marks is not None else (q.marks or test.positive_marks))

            answers = [
                ans
                for att in attempts
                for ans in att.answers
                if ans.question_id == q.id
            ]
            q_answers_count = len(answers)
            correct_cnt = sum(1 for a in answers if a.is_correct)
            # Unattempted condition: neither options selected nor numerical answer supplied
            unattempted_cnt = sum(
                1 for a in answers
                if not (a.selected_option_ids and a.selected_option_ids.strip())
                and a.numerical_answer is None
            )
            attempted_cnt = q_answers_count - unattempted_cnt
            incorrect_cnt = attempted_cnt - correct_cnt

            correct_pct = round((correct_cnt / q_answers_count * 100), 1) if q_answers_count > 0 else 0.0
            incorrect_pct = round((incorrect_cnt / q_answers_count * 100), 1) if q_answers_count > 0 else 0.0
            unattempted_pct = round((unattempted_cnt / q_answers_count * 100), 1) if q_answers_count > 0 else 0.0
            avg_marks = round(sum(a.marks_awarded for a in answers) / q_answers_count, 2) if q_answers_count > 0 else 0.0

            # Empirical difficulty:
            # difficulty_percentage = correct_count / attempted_count * 100
            if attempted_cnt > 0:
                accuracy_pct = round((correct_cnt / attempted_cnt * 100), 1)
                if accuracy_pct >= 70.0:
                    difficulty_str = "EASY"
                elif accuracy_pct <= 35.0:
                    difficulty_str = "DIFFICULT"
                else:
                    difficulty_str = "MODERATE"
            else:
                accuracy_pct = 0.0
                difficulty_str = "MODERATE"

            # Option Response Distribution (MCQ, MSQ, TRUE_FALSE)
            option_dist: Optional[List[OptionDistributionItem]] = None
            avg_num_val: Optional[float] = None

            if q.options and len(q.options) > 0:
                option_dist = []
                sorted_opts = sorted(q.options, key=lambda o: o.option_order)
                for opt_idx, opt in enumerate(sorted_opts):
                    opt_letter = chr(65 + opt_idx)
                    opt_id_str = str(opt.id)

                    # Count how many candidate answers contain this option ID
                    sel_count = 0
                    for a in answers:
                        if a.selected_option_ids:
                            clean_ids = [
                                p.strip().replace('"', '').replace("'", "")
                                for p in a.selected_option_ids.replace("[", "").replace("]", "").split(",")
                            ]
                            if opt_id_str in clean_ids:
                                sel_count += 1

                    sel_pct = round((sel_count / q_answers_count * 100), 1) if q_answers_count > 0 else 0.0
                    option_dist.append(
                        OptionDistributionItem(
                            option_id=opt_id_str,
                            option_label=opt_letter,
                            content_preview=opt.content[:60] + ("..." if len(opt.content) > 60 else ""),
                            selection_count=sel_count,
                            selection_percentage=sel_pct,
                            is_correct=opt.is_correct,
                        )
                    )
            elif q.question_type == "NUMERICAL":
                numeric_vals = [a.numerical_answer for a in answers if a.numerical_answer is not None]
                if numeric_vals:
                    avg_num_val = round(sum(numeric_vals) / len(numeric_vals), 2)

            q_perf_list.append(
                QuestionPerformanceItem(
                    question_id=q.id,
                    order_index=tq.order_index,
                    question_type=q.question_type,
                    preview=q.content[:100] + ("..." if len(q.content) > 100 else ""),
                    max_marks=q_max_marks,
                    attempted_count=attempted_cnt,
                    correct_count=correct_cnt,
                    incorrect_count=incorrect_cnt,
                    unattempted_count=unattempted_cnt,
                    correct_percentage=correct_pct,
                    incorrect_percentage=incorrect_pct,
                    unattempted_percentage=unattempted_pct,
                    accuracy_percentage=accuracy_pct,
                    total_attempts=q_answers_count,
                    average_marks=avg_marks,
                    difficulty=difficulty_str,
                    option_distribution=option_dist,
                    average_numerical_value=avg_num_val,
                )
            )

        # Sort easiest (highest accuracy %) and most difficult (lowest accuracy %)
        active_q_perf = [q for q in q_perf_list if q.total_attempts > 0]
        easiest = sorted(active_q_perf, key=lambda x: x.accuracy_percentage, reverse=True)[:3]
        most_difficult = sorted(active_q_perf, key=lambda x: x.accuracy_percentage)[:3]

        easiest_ids = {q.question_id for q in easiest}
        hardest_ids = {q.question_id for q in most_difficult}
        for q_item in q_perf_list:
            q_item.is_easiest = q_item.question_id in easiest_ids
            q_item.is_most_difficult = q_item.question_id in hardest_ids

        # Batch load integrity events for all attempts in this test
        all_att_ids = [a.id for a in test.attempts]
        integrity_map: Dict[uuid.UUID, Dict[str, Any]] = {}
        if all_att_ids:
            all_events = db.scalars(
                select(AttemptIntegrityEvent).where(AttemptIntegrityEvent.attempt_id.in_(all_att_ids))
            ).all()
            for ev in all_events:
                if ev.attempt_id not in integrity_map:
                    integrity_map[ev.attempt_id] = {
                        "count": 0,
                        "tab_switches": 0,
                        "fullscreen_exits": 0,
                        "multiple_tabs": 0,
                        "inactive_seconds": 0.0,
                    }
                entry = integrity_map[ev.attempt_id]
                entry["count"] += 1
                etype = ev.event_type.upper()
                if etype in ("TAB_SWITCHED", "VISIBILITY_HIDDEN"):
                    entry["tab_switches"] += 1
                elif etype == "FULLSCREEN_EXITED":
                    entry["fullscreen_exits"] += 1
                elif etype == "MULTIPLE_TAB_DETECTED":
                    entry["multiple_tabs"] += 1
                elif etype in ("INACTIVITY_ENDED", "INACTIVITY_STARTED") and ev.duration_seconds:
                    entry["inactive_seconds"] += float(ev.duration_seconds)

        # Student Submissions Table: completed submissions ranked first
        sorted_attempts = sorted(attempts, key=lambda x: x.score, reverse=True)
        student_summaries: List[StudentSubmissionSummary] = []
        for rank, att in enumerate(sorted_attempts, start=1):
            att_attempted = att.correct_count + att.incorrect_count
            att_accuracy = (
                round((att.correct_count / att_attempted * 100), 1)
                if att_attempted > 0
                else 0.0
            )
            im = integrity_map.get(att.id, {})
            ev_count = im.get("count", 0)
            is_review = (
                im.get("multiple_tabs", 0) > 0
                or im.get("tab_switches", 0) >= 3
                or im.get("fullscreen_exits", 0) >= 3
                or im.get("inactive_seconds", 0.0) >= 180
            )
            student_summaries.append(
                StudentSubmissionSummary(
                    attempt_id=att.id,
                    rank=rank,
                    student_name=att.student_name,
                    roll_number=att.roll_number,
                    score=att.score,
                    total_marks=att.total_marks,
                    percentage=att.percentage,
                    accuracy=att_accuracy,
                    correct_count=att.correct_count,
                    incorrect_count=att.incorrect_count,
                    unattempted_count=att.unattempted_count,
                    time_taken_seconds=att.time_taken_seconds,
                    submitted_at=att.submitted_at or att.created_at,
                    status=att.status,
                    review_recommended=is_review,
                    integrity_events_count=ev_count,
                )
            )

        # Append IN_PROGRESS & EXPIRED candidates for live monitoring
        other_attempts = [a for a in test.attempts if a.status not in ("SUBMITTED", "COMPLETED")]
        for att in other_attempts:
            elapsed = att.time_taken_seconds or 0
            if att.started_at and att.status == "IN_PROGRESS":
                st = att.started_at.replace(tzinfo=timezone.utc) if att.started_at.tzinfo is None else att.started_at
                elapsed = max(0, int((datetime.now(timezone.utc) - st).total_seconds()))
            att_attempted = att.correct_count + att.incorrect_count
            att_accuracy = (
                round((att.correct_count / att_attempted * 100), 1)
                if att_attempted > 0
                else 0.0
            )
            im = integrity_map.get(att.id, {})
            ev_count = im.get("count", 0)
            is_review = (
                im.get("multiple_tabs", 0) > 0
                or im.get("tab_switches", 0) >= 3
                or im.get("fullscreen_exits", 0) >= 3
                or im.get("inactive_seconds", 0.0) >= 180
            )
            student_summaries.append(
                StudentSubmissionSummary(
                    attempt_id=att.id,
                    rank=len(student_summaries) + 1,
                    student_name=att.student_name,
                    roll_number=att.roll_number,
                    score=att.score,
                    total_marks=att.total_marks,
                    percentage=att.percentage,
                    accuracy=att_accuracy,
                    correct_count=att.correct_count,
                    incorrect_count=att.incorrect_count,
                    unattempted_count=att.unattempted_count,
                    time_taken_seconds=elapsed,
                    submitted_at=att.submitted_at,
                    status=att.status,
                    review_recommended=is_review,
                    integrity_events_count=ev_count,
                )
            )

        return TestAnalyticsResponse(
            test_id=test.id,
            test_title=test.title,
            test_code=test.code,
            subject_name=test.subject.name if test.subject else None,
            test_status=test.status,
            total_participants=total_participants,
            completed_submissions=completed_submissions,
            in_progress_count=in_progress_count,
            not_started_count=not_started_count,
            expired_count=expired_count,
            total_questions=total_q_count,
            total_marks=dynamic_total_marks,
            duration_minutes=test.duration_minutes,
            average_score=avg_score,
            highest_score=highest_score,
            lowest_score=lowest_score,
            median_score=median_score,
            average_percentage=avg_percentage,
            average_accuracy=avg_accuracy,
            completion_rate=completion_rate,
            submission_rate=submission_rate,
            average_time_seconds=avg_time,
            score_distribution=distribution,
            question_performance=q_perf_list,
            easiest_questions=easiest,
            most_difficult_questions=most_difficult,
            student_submissions=student_summaries,
        )

    @staticmethod
    def get_student_submission_detail(db: Session, attempt_id: uuid.UUID) -> StudentSubmissionDetail:
        att = db.scalar(
            select(TestAttempt)
            .options(
                selectinload(TestAttempt.test).selectinload(Test.subject),
                selectinload(TestAttempt.test).selectinload(Test.test_questions),
                selectinload(TestAttempt.answers)
                .selectinload(TestAttemptAnswer.question)
                .selectinload(Question.options),
            )
            .where(TestAttempt.id == attempt_id)
        )
        if not att:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student attempt not found.")

        # Map test questions for accurate order and marks overrides
        tq_map = {}
        if att.test and att.test.test_questions:
            for tq in att.test.test_questions:
                tq_map[tq.question_id] = tq

        answer_details: List[StudentAnswerDetail] = []
        for idx, ans in enumerate(att.answers, start=1):
            q = ans.question
            if not q:
                continue

            tq = tq_map.get(q.id)
            order_idx = tq.order_index if tq else idx
            max_marks = float(tq.marks if tq and tq.marks is not None else (q.marks or 4.0))

            correct_ans_str = ""
            if q.options and len(q.options) > 0:
                corr_opts = [
                    f"({chr(65 + i)}) {o.content}" for i, o in enumerate(sorted(q.options, key=lambda x: x.option_order)) if o.is_correct
                ]
                correct_ans_str = ", ".join(corr_opts) if corr_opts else "None marked"
            elif q.numerical_answer is not None:
                tol_str = f" (±{q.numerical_tolerance})" if q.numerical_tolerance else ""
                correct_ans_str = f"{q.numerical_answer}{tol_str}"

            # Format candidate answer with options text if applicable
            student_ans_str = "Unattempted"
            is_unattempted = True
            if ans.selected_option_ids and ans.selected_option_ids.strip():
                is_unattempted = False
                opt_id_map = {str(o.id): (chr(65 + i), o.content) for i, o in enumerate(sorted(q.options, key=lambda x: x.option_order))}
                matched_labels = []
                raw_sel = ans.selected_option_ids
                for part in raw_sel.replace("[", "").replace("]", "").replace('"', '').split(","):
                    part_clean = part.strip()
                    if part_clean in opt_id_map:
                        label, text = opt_id_map[part_clean]
                        matched_labels.append(f"({label}) {text}")
                if matched_labels:
                    student_ans_str = ", ".join(matched_labels)
                else:
                    student_ans_str = raw_sel
            elif ans.numerical_answer is not None:
                is_unattempted = False
                student_ans_str = str(ans.numerical_answer)

            if is_unattempted:
                ans_status = "UNATTEMPTED"
            elif ans.is_correct:
                ans_status = "CORRECT"
            else:
                ans_status = "INCORRECT"

            answer_details.append(
                StudentAnswerDetail(
                    question_id=q.id,
                    order_index=order_idx,
                    question_content=q.content,
                    question_type=q.question_type,
                    student_answer=student_ans_str,
                    correct_answer=correct_ans_str,
                    is_correct=ans.is_correct,
                    status=ans_status,
                    marks_awarded=ans.marks_awarded,
                    max_marks=max_marks,
                    explanation=q.explanation,
                )
            )

        # Sort answers by order_index
        answer_details.sort(key=lambda x: x.order_index)

        att_attempted = att.correct_count + att.incorrect_count
        att_accuracy = (
            round((att.correct_count / att_attempted * 100), 1)
            if att_attempted > 0
            else 0.0
        )

        integrity_summary = IntegrityService.get_attempt_integrity_summary(db, att.id)

        return StudentSubmissionDetail(
            attempt_id=att.id,
            test_id=att.test_id,
            test_title=att.test.title if att.test else "Examination Paper",
            subject_name=att.test.subject.name if att.test and att.test.subject else None,
            student_name=att.student_name,
            roll_number=att.roll_number,
            score=att.score,
            total_marks=att.total_marks,
            percentage=att.percentage,
            accuracy=att_accuracy,
            correct_count=att.correct_count,
            incorrect_count=att.incorrect_count,
            unattempted_count=att.unattempted_count,
            time_taken_seconds=att.time_taken_seconds,
            submitted_at=att.submitted_at or att.created_at,
            answers=answer_details,
            integrity_summary=integrity_summary,
        )

    @staticmethod
    def _sanitize_csv_cell(value: Any) -> Any:
        """Sanitize a cell value to prevent CSV formula injection (DDE attacks).

        If a string begins with '=', '+', '-', or '@', prepend a single quote (')
        so spreadsheet applications (Excel, Calc, Sheets) treat it strictly as text.
        """
        if value is None:
            return ""
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed and trimmed[0] in ("=", "+", "-", "@"):
                return f"'{value}"
        return value

    @staticmethod
    def generate_students_csv(db: Session, test_id: uuid.UUID) -> str:
        """Generate UTF-8 CSV string of candidate results for the selected test."""
        analytics = AnalyticsService.get_test_analytics(db, test_id)

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header columns per specification:
        # Candidate Name, Roll Number, Test, Subject, Attempt Status, Score, Maximum Marks, Percentage, Accuracy, Correct, Incorrect, Unattempted, Time Taken Seconds, Submitted At
        writer.writerow([
            "Candidate Name",
            "Roll Number",
            "Test",
            "Subject",
            "Attempt Status",
            "Score",
            "Maximum Marks",
            "Percentage",
            "Accuracy",
            "Correct",
            "Incorrect",
            "Unattempted",
            "Time Taken Seconds",
            "Submitted At",
        ])

        subject_name = analytics.subject_name or "General"
        sanitize = AnalyticsService._sanitize_csv_cell

        for s in analytics.student_submissions:
            sub_time_str = s.submitted_at.strftime("%Y-%m-%d %H:%M:%S") if s.submitted_at else "—"
            writer.writerow([
                sanitize(s.student_name),
                sanitize(s.roll_number or "—"),
                sanitize(analytics.test_title),
                sanitize(subject_name),
                sanitize(s.status),
                s.score,
                s.total_marks,
                f"{s.percentage:.1f}%",
                f"{s.accuracy:.1f}%",
                s.correct_count,
                s.incorrect_count,
                s.unattempted_count,
                s.time_taken_seconds,
                sub_time_str,
            ])

        return output.getvalue()

    @staticmethod
    def generate_questions_csv(db: Session, test_id: uuid.UUID) -> str:
        """Generate UTF-8 CSV string of question-wise item analysis for the selected test."""
        analytics = AnalyticsService.get_test_analytics(db, test_id)

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header columns per specification:
        # Question Number, Question Type, Maximum Marks, Attempted, Correct, Incorrect, Unattempted, Accuracy, Average Marks
        writer.writerow([
            "Question Number",
            "Question Type",
            "Maximum Marks",
            "Attempted",
            "Correct",
            "Incorrect",
            "Unattempted",
            "Accuracy",
            "Average Marks",
            "Difficulty",
        ])

        sanitize = AnalyticsService._sanitize_csv_cell

        for q in analytics.question_performance:
            writer.writerow([
                f"Q{q.order_index}",
                sanitize(q.question_type),
                q.max_marks,
                q.attempted_count,
                q.correct_count,
                q.incorrect_count,
                q.unattempted_count,
                f"{q.accuracy_percentage:.1f}%",
                f"{q.average_marks:.2f}",
                sanitize(q.difficulty),
            ])

        return output.getvalue()

