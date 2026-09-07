import sys
from backend.app.core.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.test import Test
from backend.app.models.question import Question
from backend.app.models.subject import Subject
from backend.app.models.topic import Topic
from backend.app.models.question_option import QuestionOption
from backend.app.models.test_question import TestQuestion
from backend.app.core.security import hash_password
from datetime import datetime, timezone

db = SessionLocal()
try:
    admin = db.query(User).filter_by(role='ADMIN').first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@example.com",
            password_hash=hash_password("AdminSecure123!"),
            display_name="Admin Teacher",
            role="ADMIN",
            status="ACTIVE"
        )
        db.add(admin)
        db.flush()

    sub = db.query(Subject).first()
    if not sub:
        sub = Subject(name="Mathematics", code="MATH")
        db.add(sub)
        db.flush()

    top = db.query(Topic).first()
    if not top:
        top = Topic(name="Algebra", subject_id=sub.id)
        db.add(top)
        db.flush()

    existing = db.query(Test).filter_by(code='MATH101').first()
    if existing:
        print(f"Existing test found: {existing.id}")
        sys.exit(0)

    test = Test(
        title="Mathematics Final Test",
        description="Responsive CBT Exam Mockup Test",
        code="MATH101",
        status="LIVE",
        duration_minutes=60,
        positive_marks=1.0,
        negative_marks=0.0,
        result_visibility="IMMEDIATE",
        created_by=admin.id,
        published_at=datetime.now(timezone.utc),
        show_answers=True,
        show_explanation=True
    )
    db.add(test)
    db.flush()

    q1 = Question(
        question_type="MCQ",
        subject_id=sub.id,
        topic_id=top.id,
        difficulty="MEDIUM",
        content=r"What is the value of $\sqrt{x^2 + 2x + 1}$ when $x > 0$?",
        explanation=r"Since $x^2 + 2x + 1 = (x+1)^2$, for $x > 0$, $\sqrt{(x+1)^2} = x+1$.",
        marks=1.0,
        negative_marks=0.0,
        created_by=admin.id
    )
    db.add(q1)
    db.flush()

    opts1 = [
        QuestionOption(question_id=q1.id, option_order=1, content=r"$x(x+1)$", is_correct=False),
        QuestionOption(question_id=q1.id, option_order=2, content=r"$(x+1)$", is_correct=True),
        QuestionOption(question_id=q1.id, option_order=3, content=r"$x^2 + 2$", is_correct=False),
        QuestionOption(question_id=q1.id, option_order=4, content=r"$(x-1)^2$", is_correct=False)
    ]
    for opt in opts1:
        db.add(opt)

    tq1 = TestQuestion(test_id=test.id, question_id=q1.id, order_index=1, marks=1.0)
    db.add(tq1)

    for i in range(2, 21):
        qi = Question(
            question_type="MCQ",
            subject_id=sub.id,
            topic_id=top.id,
            difficulty="MEDIUM",
            content=f"Question {i}: Solve the integral $\\int_0^{{{i}}} x \\, dx$ or determine the coefficient.",
            explanation=f"The integral evaluates to $\\frac{{{i}^2}}{{2}}$.",
            marks=1.0,
            negative_marks=0.0,
            created_by=admin.id
        )
        db.add(qi)
        db.flush()

        opts_i = [
            QuestionOption(question_id=qi.id, option_order=1, content=f"$\\frac{{{i}}}{{2}}$", is_correct=False),
            QuestionOption(question_id=qi.id, option_order=2, content=f"$\\frac{{{i}^2}}{{2}}$", is_correct=True),
            QuestionOption(question_id=qi.id, option_order=3, content=f"${i}^2$", is_correct=False),
            QuestionOption(question_id=qi.id, option_order=4, content=f"${i}$", is_correct=False)
        ]
        for opt in opts_i:
            db.add(opt)

        tqi = TestQuestion(test_id=test.id, question_id=qi.id, order_index=i, marks=1.0)
        db.add(tqi)

    db.commit()
    print("SUCCESS: MATH101 test created with 20 questions, test_id:", test.id)
except Exception as e:
    db.rollback()
    print("Error:", e)
finally:
    db.close()
