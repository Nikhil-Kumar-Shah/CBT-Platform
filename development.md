# CBT Test Platform

## 1. Product Objective

Build a self-hosted, mobile-first online examination platform for a coaching institute.

Teachers/admins can create questions, organize them into tests/test series, publish tests with a unique access code, and review student results.

Students do not need accounts. They enter a test code and basic identity information, take the test, and submit it.

The platform must behave like a proper CBT examination system, not like a generic online form.

---

## 2. V1 Scope

### Admin

* Secure admin login.
* Dashboard.
* Question bank.
* Manual question creation/editing/deletion.
* Image upload for questions/options/explanations where required.
* Mathematical equation support.
* Test creation and editing.
* Test series management.
* Test configuration.
* Publish/unpublish tests.
* Generate unique test access codes.
* View attempts and results.
* Basic performance analytics.
* Export results as CSV.

### Student

* Enter test code.
* Enter name and optional roll number/details.
* View test instructions.
* Start test.
* Mobile-first CBT interface.
* Question navigation.
* Previous/Next navigation.
* Question palette.
* Mark for review.
* Answer/unanswer questions.
* Countdown timer.
* Automatic answer saving.
* Resume interrupted attempts.
* Submit test.
* View result if enabled by the test.

### Explicitly out of V1

* Student accounts.
* Student passwords.
* Google/Facebook login.
* PDF question generation.
* Gemini/AI question generation.
* Video classes.
* Payments.
* Mobile applications.
* Advanced proctoring.
* Facial recognition.
* Complex LMS features.

---

# 3. Technology Stack

### Frontend

* Next.js
* React
* TypeScript
* Responsive/mobile-first UI

### Backend

* Python
* FastAPI
* REST API

### Database

* PostgreSQL

### File Storage

* Azure Blob Storage or equivalent object storage.
* PostgreSQL stores file metadata/references, not image binary data.

### Deployment

* Azure Virtual Machine
* NGINX reverse proxy
* HTTPS
* Next.js frontend
* FastAPI backend
* PostgreSQL


---

# 4. High-Level Architecture

```text
Internet
   |
 NGINX
   |
   +--------------------+
   |                    |
Next.js              FastAPI
Frontend              Backend
                         |
             +-----------+-----------+
             |                       |
         PostgreSQL             File Storage
             |                       |
      Structured data          Images/media
```

NGINX handles HTTPS and routing.

The frontend never directly performs privileged database operations.

All important business logic and validation are handled by the backend.

---

# 5. User Roles

## Admin/Teacher

Authenticated user.

Can:

* Manage questions.
* Manage tests.
* Publish tests.
* View attempts.
* View results.
* Manage test series.

V1 can use a single admin role. Design the authorization layer so additional roles can be added later.

## Student

No permanent account.

Identity for an exam is based on:

* Test code.
* Student name.
* Optional roll number.
* Generated attempt/session identifier.

The student should never need to understand the underlying authentication/session mechanism.

---

# 6. Question Bank

Questions are reusable entities independent of tests.

Each question should support:

* Question ID.
* Subject.
* Chapter/topic.
* Difficulty.
* Question type.
* Question content.
* Options.
* Correct answer.
* Explanation.
* Positive marks.
* Negative marks.
* Images/media.
* Status.
* Created/updated timestamps.
* Creator.

Initial question types:

1. Multiple Choice Question.
2. Numerical answer.

Design the question model so additional types can be added later.

---

# 7. Question Content

Questions must not be limited to plain text.

Support:

* Normal text.
* Images.
* Mathematical equations.
* Basic rich text.
* Images inside question content.
* Images inside explanations.
* Images as option content where practical.

Use a structured content representation rather than storing everything as one plain-text string.

Do not store image binaries in PostgreSQL.

Store the media in object storage and keep the storage key/reference in PostgreSQL.

---

# 8. Question Editor

Provide a simple form/rich editor.

Example:

```text
Subject
Chapter
Difficulty
Question content

[Add Image]
[Add Equation]

Options
A
B
C
D

Correct Answer

Marks
Negative Marks

Explanation

[Save]
```

The editor should make manual question creation fast.

Do not make the teacher configure unnecessary technical fields.

---

# 9. Test Builder

A test is a collection of existing questions.

Teacher can:

* Create test.
* Set title.
* Set description/instructions.
* Select questions.
* Reorder questions.
* Remove questions.
* Configure duration.
* Configure marking.
* Enable/disable result visibility.
* Enable/disable answer explanations.
* Randomize question order.
* Randomize options where supported.
* Publish/unpublish.

Example:

```text
Physics Mock Test 01

50 Questions
60 Minutes
+4 Correct
-1 Wrong

[Publish Test]
```

---

# 10. Test Series

A test series groups multiple tests.

Example:

```text
JEE Physics Test Series

01 - Kinematics
02 - Laws of Motion
03 - Work & Energy
04 - Full Physics Mock
```

A test can belong to a test series but must remain independently accessible/configurable.

---

# 11. Test Access

Every published test receives a unique human-readable access code.

Example:

```text
PHY-26-X7K4
```

Student workflow:

```text
Enter Test Code
        ↓
Validate
        ↓
Enter Name
        ↓
View Instructions
        ↓
Start Test
```

No student registration.

---

# 12. Exam Attempt

Starting a test creates an attempt.

Conceptually:

```text
Attempt
- ID
- Test ID
- Student name
- Roll number
- Session token
- Started at
- Expires at
- Status
- Submitted at
- Score
```

Possible statuses:

```text
IN_PROGRESS
SUBMITTED
EXPIRED
ABANDONED
```

The attempt is the authoritative record of the student's examination.

---

# 13. Resume / Recovery

Exam state must survive:

* Accidental tab closure.
* Browser refresh.
* Temporary network failure.
* Phone/browser restart where recovery credentials remain available.

Answers must be saved continuously.

The browser should maintain temporary local state for resilience, but the PostgreSQL-backed backend remains the authoritative source.

Provide a secure resume mechanism.

Do not rely only on browser local storage or cookies for permanent recovery.

---

# 14. Exam Timer

Timer must be server-authoritative.

Store:

```text
started_at
expires_at
```

The frontend only displays the remaining time.

The backend must reject submissions/answer modifications after the attempt has expired according to the test rules.

Do not trust a timer value sent by the browser.

---

# 15. Answer Saving

When a student selects an answer:

```text
Frontend state updated
        ↓
Answer saved to backend
```

Saving should be lightweight and reliable.

Store:

* Attempt ID.
* Question ID.
* Selected answer.
* Mark-for-review state.
* Updated timestamp.

Temporary network failures must not destroy the student's current answers.

---

# 16. Student CBT Interface

Mobile-first.

Main interface:

```text
Test Title                 Timer

Question 12 / 50

Question content

Image/equation if present

A. Option
B. Option
C. Option
D. Option

[Mark for Review]

[Previous]       [Next]
```

Provide a question palette showing:

* Answered.
* Unanswered.
* Marked for review.
* Current question.

Touch targets must be comfortable on phone screens.

Avoid unnecessary animations and heavy UI.

---

# 17. Submission

Before final submission:

```text
Answered: 47
Unanswered: 3
Marked: 2

[Cancel] [Submit Test]
```

Backend must:

1. Verify attempt.
2. Verify ownership/session.
3. Verify submission status.
4. Verify expiry.
5. Calculate result.
6. Store result.
7. Mark attempt as submitted.
8. Prevent duplicate submission.

Evaluation must happen server-side.

---

# 18. Evaluation

For V1 support:

```text
Correct answer
Wrong answer
Unanswered
Positive marks
Negative marks
Total score
```

Example:

```text
Correct:     43
Wrong:        4
Unanswered:   3

Score:       168 / 200
```

Never trust a score calculated by the frontend.

---

# 19. Results

Admin can view:

* Student name.
* Roll number.
* Score.
* Correct answers.
* Wrong answers.
* Unanswered.
* Accuracy.
* Time taken.
* Submission time.

Optional student result page controlled by test settings.

---

# 20. Analytics

V1 analytics should remain simple.

### Test-level

* Number of participants.
* Submitted/in-progress count.
* Average score.
* Highest score.
* Lowest score.
* Score distribution.

### Question-level

* Correct percentage.
* Wrong percentage.
* Unanswered percentage.

### Topic-level

* Average performance by subject/topic where metadata exists.

Do not build advanced analytics in V1.

---

# 21. Admin Dashboard

Dashboard should show:

```text
Total Questions
Active Tests
Published Tests
Total Attempts

Recent Tests
Recent Results
```

Navigation:

```text
Dashboard
Question Bank
Tests
Test Series
Attempts / Results
Analytics
Settings
```

---

# 22. Media Handling

Images should be treated as first-class question content.

Upload flow:

```text
Admin
 ↓
FastAPI
 ↓
Validate file
 ↓
Process/resize if necessary
 ↓
Object Storage
 ↓
Store media reference in PostgreSQL
```

Validate:

* File type.
* MIME type.
* File size.
* Actual file content.
* Image dimensions.

Do not allow arbitrary executable files.

Prefer optimized formats such as WebP where appropriate.

---

# 23. Database Core Entities

Initial schema should include approximately:

```text
users

subjects
chapters
topics

questions
question_options
question_media

tests
test_questions
test_settings

test_series
test_series_tests

attempts
attempt_answers

results
result_question_stats
```

Use foreign keys and indexes appropriately.

Important indexes should exist for:

* Test code.
* Attempt ID.
* Test ID.
* Student/attempt lookup.
* Question ID.
* Result queries.

---

# 24. API Structure

Use versioned REST APIs.

```text
/api/v1/auth

/api/v1/questions
/api/v1/questions/{id}

/api/v1/tests
/api/v1/tests/{id}

/api/v1/test-series

/api/v1/attempts
/api/v1/attempts/{id}
/api/v1/attempts/{id}/answers
/api/v1/attempts/{id}/submit

/api/v1/results
/api/v1/analytics

/api/v1/media
```

Keep API responsibilities separated by domain.

---

# 25. Security Requirements

Backend is authoritative.

Never trust client-provided:

* Score.
* Correct answer.
* Test duration.
* Expiry state.
* Attempt ownership.
* Test configuration.
* Admin permissions.

Use:

* Secure admin authentication.
* Password hashing.
* Session/token security.
* Authorization checks.
* Input validation.
* Rate limiting for public endpoints.
* HTTPS.
* Secure HTTP headers.
* Database credentials outside source code.
* Environment variables/secrets.
* Restricted database network access.

PostgreSQL must not be publicly exposed to the internet.

---

# 26. Concurrent Users

The system must support multiple students taking the same test simultaneously.

Do not keep exam state only in server memory.

Use PostgreSQL as the persistent source of truth.

Backend should remain stateless where possible so multiple FastAPI workers can operate safely.

Avoid unnecessary real-time infrastructure for V1.

Normal request/response APIs are sufficient.

---

# 27. Deployment

Initial VM:

```text
NGINX
Next.js
FastAPI
PostgreSQL
```

Recommended process separation:

```text
nginx
nextjs
fastapi
postgresql
```

Use systemd/Docker Compose or another simple process-management approach.

Do not introduce Kubernetes or microservices.

---

# 28. Backup

PostgreSQL must have automated backups.

Backups should be stored separately from the primary database.

Important media should also have a backup/recovery strategy.

Regularly verify that database restoration actually works.

---

# 29. Development Order

Build in this order:

### Phase 1

Project structure + PostgreSQL schema + admin authentication.

### Phase 2

Question Bank + Question Editor + image upload.

### Phase 3

Test Builder + test configuration + test codes.

### Phase 4

Student entry + exam attempt/session system.

### Phase 5

Mobile CBT interface + timer + navigation.

### Phase 6

Autosave + resume/recovery.

### Phase 7

Submission + server-side evaluation + results.

### Phase 8

Admin results + analytics + CSV export.

### Phase 9

Production deployment + security hardening + backups.

---

# 30. V1 Completion Criteria

The product is considered functional when:

1. Admin can create questions.
2. Questions can contain images/equations.
3. Admin can build a test from the question bank.
4. Admin can publish a test and generate an access code.
5. A student can enter the code without creating an account.
6. Student can complete the test from a phone.
7. Answers are continuously persisted.
8. Closing/reopening the test can recover the attempt.
9. Timer cannot be manipulated from the client.
10. Student can submit the test.
11. Backend calculates the score.
12. Admin can see results.
13. Multiple students can take the same test simultaneously.
14. PostgreSQL contains all critical exam state.
15. Uploaded media is stored separately from PostgreSQL.
16. The entire system can be deployed on the Azure VM without Firebase/Supabase/Tally or another backend-as-a-service.

---

# Core Principle

Build a **simple, reliable CBT platform first**.

The architecture should prioritize:

```text
Reliable exam sessions
        ↓
Persistent answers
        ↓
Correct evaluation
        ↓
Simple administration
        ↓
Good mobile experience
```

Do not add AI, PDF processing, student accounts, proctoring, or other secondary features until the core examination workflow is stable.
