"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  AttemptResultResponse,
} from "@/lib/api";
import { MathRenderer } from "@/components/MathRenderer";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User as UserIcon,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function StudentResultPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params?.attemptId as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AttemptResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFullReview, setShowFullReview] = useState(false);

  useEffect(() => {
    if (!attemptId) return;

    let sessionId = "";
    try {
      sessionId =
        localStorage.getItem(`cbt_session_${attemptId}`) ||
        localStorage.getItem("cbt_current_session_id") ||
        "";
    } catch (e) {}

    const loadResult = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getAttemptResult(attemptId, sessionId || undefined);
        setResult(data);
      } catch (err: any) {
        setError(err?.message || "Failed to retrieve examination results.");
      } finally {
        setLoading(false);
      }
    };

    loadResult();
  }, [attemptId]);

  const formatSubmittedDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-main)",
          color: "var(--text-main)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "var(--font-family)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid rgba(99, 102, 241, 0.2)",
            borderTopColor: "var(--primary-500)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
          Compiling Examination Submission...
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-main)",
          color: "var(--text-main)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "var(--font-family)",
        }}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "2.5rem 2rem",
            maxWidth: "460px",
            textAlign: "center",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <AlertCircle size={44} color="var(--danger)" style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontSize: "1.3rem", color: "var(--text-main)", marginBottom: "0.5rem" }}>
            Result Unavailable
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
            {error || "Unable to fetch result record."}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={() => router.push("/")}
              style={{
                background: "var(--bg-surface-elevated)",
                color: "var(--text-main)",
                border: "1px solid var(--border-color)",
                padding: "0.65rem 1.25rem",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Home
            </button>
            <button
              onClick={() => router.push("/exam")}
              style={{
                background: "var(--primary-500)",
                color: "#ffffff",
                border: "none",
                padding: "0.65rem 1.4rem",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatDuration = (seconds?: number | null) => {
    if (seconds === undefined || seconds === null || seconds < 0) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const isImmediate =
    (result.result_visibility === "IMMEDIATELY" || result.show_results === true) &&
    result.score !== null &&
    result.score !== undefined;
  const isAutoExpired = Boolean(
    result.is_auto_expired ||
    result.status === "EXPIRED" ||
    result.submission_reason === "AUTO_EXPIRED"
  );
  const totalQuestions =
    (result.total_questions !== undefined && result.total_questions !== null)
      ? result.total_questions
      : ((result.correct_count ?? 0) + (result.incorrect_count ?? 0) + (result.unattempted_count ?? 0)) || (result.answers?.length ?? 0);
  const answeredCount =
    (result.answered_count !== undefined && result.answered_count !== null)
      ? result.answered_count
      : ((result.correct_count ?? 0) + (result.incorrect_count ?? 0));
  const unansweredCount =
    (result.unanswered_count !== undefined && result.unanswered_count !== null)
      ? result.unanswered_count
      : (result.unattempted_count ?? Math.max(0, totalQuestions - answeredCount));
  const correctCount = result.correct_count ?? 0;
  const incorrectCount = result.incorrect_count ?? 0;
  const accuracy =
    result.accuracy !== null && result.accuracy !== undefined
      ? result.accuracy
      : answeredCount > 0
      ? Math.round((correctCount / answeredCount) * 1000) / 10
      : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-main)",
        color: "var(--text-main)",
        fontFamily: "var(--font-family)",
        padding: "2.5rem 1rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: "1.5rem", right: "1.5rem" }}>
        <ThemeToggle />
      </div>

      <div style={{ width: "100%", maxWidth: "620px" }}>
        {/* =========================================================================
            COMPLETION & RECEIPT CARD (Emberspire Card-Blade)
            ========================================================================= */}
        <div
          className="card card-blade"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-xl)",
            padding: "2.5rem 2rem",
            textAlign: "center",
            boxShadow: "var(--shadow-lg)",
            marginBottom: "1.5rem",
          }}
        >
          {/* Green Checkmark Badge */}
          <div
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.15)",
              border: "2px solid #10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}
          >
            <CheckCircle2 size={36} color="#10b981" />
          </div>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 0.4rem 0" }}>
            Examination Submitted
          </h1>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: "0 0 1.5rem 0" }}>
            {result.test_title || "Your examination"} has been successfully submitted and recorded.
          </p>

          {/* Submission Details Card */}
          <div
            style={{
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              padding: "1.25rem 1.5rem",
              marginBottom: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              fontSize: "0.88rem",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Calendar size={18} color="#818cf8" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Submitted At</div>
                  <strong style={{ color: "var(--text-main)" }}>
                    {formatSubmittedDate(result.submitted_at || result.expired_at)}
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Clock size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Time Taken</div>
                  <strong style={{ color: "var(--text-main)" }}>
                    {formatDuration(result.time_taken_seconds)}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <FileCheck2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Answered</div>
                  <strong style={{ color: "#10b981" }}>
                    {answeredCount} / {totalQuestions}
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Clock size={18} color="#f87171" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Unanswered</div>
                  <strong style={{ color: "#f87171" }}>
                    {unansweredCount}
                  </strong>
                </div>
              </div>
            </div>

            {/* If Results Are Immediate: Show Score, Percentage, Accuracy, Correct, Incorrect */}
            {isImmediate && (
              <div
                style={{
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Score</div>
                    <strong style={{ fontSize: "1.25rem", color: "#38bdf8" }}>
                      {result.score} / {result.total_marks}
                    </strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Percentage</div>
                    <strong style={{ fontSize: "1.25rem", color: "#34d399" }}>
                      {result.percentage?.toFixed(1)}%
                    </strong>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", background: "var(--bg-surface)", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Correct</div>
                    <strong style={{ color: "#34d399", fontSize: "0.95rem" }}>{correctCount}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Incorrect</div>
                    <strong style={{ color: "#f87171", fontSize: "0.95rem" }}>{incorrectCount}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Accuracy</div>
                    <strong style={{ color: "#818cf8", fontSize: "0.95rem" }}>{accuracy.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button: View Result / Toggle Detailed Review */}
          {isImmediate && result.show_answers !== false && result.answers && result.answers.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowFullReview(!showFullReview)}
              style={{
                width: "100%",
                minHeight: "48px",
                background: "#4f46e5",
                color: "var(--text-main)",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.4)",
              }}
            >
              <span>{showFullReview ? "Hide Answer Review" : "View Detailed Answers"}</span>
              {showFullReview ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          ) : (
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              {result.message || "Detailed answers and rankings will be released according to your institution's schedule."}
            </div>
          )}

          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={{
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-color)",
                color: "var(--text-main)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
              }}
            >
              Back to Home
            </button>
            <button
              type="button"
              onClick={() => router.push("/exam")}
              style={{
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-color)",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
              }}
            >
              Examination Lobby
            </button>
          </div>
        </div>

        {/* =========================================================================
            QUESTION-BY-QUESTION REVIEW (If Permitted & Expanded)
            ========================================================================= */}
        {showFullReview && result.show_answers !== false && result.answers && result.answers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", margin: "0 0 0.5rem 0" }}>
              Question-by-Question Review
            </h3>

            {result.answers.map((ans, idx) => (
              <div
                key={ans.question_id || idx}
                style={{
                  background: "var(--bg-surface)",
                  border: `1px solid ${
                    ans.is_correct === true
                      ? "rgba(16, 185, 129, 0.4)"
                      : ans.is_correct === false
                      ? "rgba(239, 68, 68, 0.4)"
                      : "var(--border-color)"
                  }`,
                  borderRadius: "12px",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-main)" }}>
                    Question {ans.order_index}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color:
                        ans.is_correct === true
                          ? "#34d399"
                          : ans.is_correct === false
                          ? "#f87171"
                          : "var(--text-muted)",
                    }}
                  >
                    {ans.is_correct === true
                      ? `Correct (+${ans.marks_awarded})`
                      : ans.is_correct === false
                      ? `Incorrect (-${ans.negative_marks})`
                      : "Unattempted"}
                  </span>
                </div>

                <div className="cbt-math-container" style={{ fontSize: "0.95rem", color: "var(--text-main)", marginBottom: "1rem" }}>
                  <MathRenderer content={ans.question_content} />
                </div>

                {/* STRUCTURED OPTIONS DISPLAY */}
                {ans.options && ans.options.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem" }}>
                    {ans.options.map((opt) => {
                      const isSelected = opt.is_selected;
                      const isCorrect = opt.is_correct === true;
                      const isIncorrect = opt.is_correct === false;

                      let borderStyle = "1px solid var(--border-color)";
                      let bgStyle = "var(--bg-input)";
                      let statusBadge = null;

                      if (isSelected && isCorrect) {
                        borderStyle = "1.5px solid #10b981";
                        bgStyle = "rgba(16, 185, 129, 0.12)";
                        statusBadge = (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", color: "#34d399", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0, padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(16, 185, 129, 0.2)", border: "1px solid rgba(16, 185, 129, 0.4)", whiteSpace: "nowrap" }}>
                            <CheckCircle2 size={13} /> Your Answer (Correct)
                          </span>
                        );
                      } else if (isSelected && isIncorrect) {
                        borderStyle = "1.5px solid #ef4444";
                        bgStyle = "rgba(239, 68, 68, 0.12)";
                        statusBadge = (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", color: "#f87171", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0, padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(239, 68, 68, 0.2)", border: "1px solid rgba(239, 68, 68, 0.4)", whiteSpace: "nowrap" }}>
                            <XCircle size={13} /> Your Answer (Incorrect)
                          </span>
                        );
                      } else if (isSelected && opt.is_correct === null) {
                        borderStyle = "1.5px solid var(--primary-500)";
                        bgStyle = "rgba(124, 58, 237, 0.12)";
                        statusBadge = (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", color: "var(--text-main)", fontSize: "0.75rem", fontWeight: 600, flexShrink: 0, padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(255, 255, 255, 0.1)", border: "1px solid var(--border-color)", whiteSpace: "nowrap" }}>
                            Your Answer
                          </span>
                        );
                      } else if (!isSelected && isCorrect) {
                        borderStyle = "1.5px solid rgba(16, 185, 129, 0.6)";
                        bgStyle = "rgba(16, 185, 129, 0.06)";
                        statusBadge = (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", color: "#34d399", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0, padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.35)", whiteSpace: "nowrap" }}>
                            <CheckCircle2 size={13} /> Correct Answer
                          </span>
                        );
                      }

                      return (
                        <div
                          key={opt.id || opt.option_order}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            padding: "0.75rem 1rem",
                            borderRadius: "8px",
                            backgroundColor: bgStyle,
                            border: borderStyle,
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem", flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                color: isSelected
                                  ? (isCorrect ? "#34d399" : "#f87171")
                                  : isCorrect
                                  ? "#34d399"
                                  : "var(--text-muted)",
                                minWidth: "22px",
                              }}
                            >
                              {String.fromCharCode(64 + opt.option_order)}.
                            </span>
                            <div className="cbt-math-container" style={{ flex: 1, fontSize: "0.9rem", color: "var(--text-main)", lineHeight: 1.4 }}>
                              <MathRenderer content={opt.content} />
                            </div>
                          </div>
                          {statusBadge}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* NUMERICAL / TEXT / FALLBACK STRUCTURED DISPLAY */
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: ans.correct_answer ? "1fr 1fr" : "1fr",
                      gap: "0.75rem",
                      fontSize: "0.85rem",
                      background: "var(--bg-surface-elevated)",
                      padding: "0.85rem 1.1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <div className="cbt-math-container">
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
                        Your Answer:
                      </span>
                      <strong
                        style={{
                          color:
                            ans.is_correct === true
                              ? "#34d399"
                              : ans.is_correct === false
                              ? "#f87171"
                              : "var(--text-subtle)",
                        }}
                      >
                        {ans.candidate_answer ? (
                          <MathRenderer inline content={ans.candidate_answer} />
                        ) : (
                          <span style={{ fontStyle: "italic", color: "var(--text-subtle)" }}>Unattempted / Left Blank</span>
                        )}
                      </strong>
                    </div>

                    {ans.correct_answer && (
                      <div className="cbt-math-container">
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
                          Official Correct Answer:
                        </span>
                        <strong style={{ color: "#34d399" }}>
                          <MathRenderer inline content={ans.correct_answer} />
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {ans.explanation && (
                  <div
                    className="cbt-math-container"
                    style={{
                      fontSize: "0.84rem",
                      color: "var(--text-muted)",
                      marginTop: "0.75rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--border-color)",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: "var(--text-main)", display: "block", marginBottom: "0.25rem" }}>
                      Explanation:
                    </strong>
                    <MathRenderer content={ans.explanation} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
