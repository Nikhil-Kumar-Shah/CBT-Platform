"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NextLink from "next/link";
import {
  api,
  Test,
  TestAnalyticsResponse,
  StudentSubmissionSummary,
  StudentSubmissionDetail,
} from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MathRenderer } from "@/components/MathRenderer";
import { useAdminAutoRefresh } from "@/lib/hooks/useAdminAutoRefresh";
import {
  BarChart3,
  Users,
  Send,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Percent,
  ArrowUpRight,
  Eye,
  X,
  FileText,
  Search,
  Layers,
  HelpCircle,
  Activity,
  Radio,
  RotateCw,
  ExternalLink,
  Filter,
  Check,
  Award,
  BookOpen,
  Calendar,
  ChevronRight,
  Flame,
  Shield,
  ShieldAlert,
  Download,
  FileSpreadsheet,
  PieChart,
  Target,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { IntegrityTimelineModal } from "@/components/IntegrityTimelineModal";

export default function ResultsAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="container"
          style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--text-muted)" }}
        >
          Loading examination results & analytics...
        </div>
      }
    >
      <ResultsAnalyticsContent />
    </Suspense>
  );
}

function ResultsAnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTestId = searchParams.get("test_id") || "";

  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string>(initialTestId);
  const [analytics, setAnalytics] = useState<TestAnalyticsResponse | null>(null);

  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingCandidates, setExportingCandidates] = useState(false);
  const [exportingQuestions, setExportingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active section tab: "OVERVIEW" | "STUDENTS" | "QUESTIONS"
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "STUDENTS" | "QUESTIONS">("OVERVIEW");

  // Selector search and filters (when browsing papers)
  const [testSearch, setTestSearch] = useState("");
  const [testStatusFilter, setTestStatusFilter] = useState("ALL");
  const [showPaperPicker, setShowPaperPicker] = useState(!initialTestId);

  // Candidate ranking filters & sorting
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<"ALL" | "SUBMITTED" | "IN_PROGRESS" | "EXPIRED">("ALL");
  const [candidateIntegrityFilter, setCandidateIntegrityFilter] = useState<"ALL" | "REVIEW" | "EVENTS" | "CLEAN">("ALL");
  const [candidateScoreFilter, setCandidateScoreFilter] = useState<"ALL" | "HIGH" | "MID" | "LOW">("ALL");
  const [candidateSortField, setCandidateSortField] = useState<"rank" | "score" | "percentage" | "time_taken_seconds" | "submitted_at">("rank");
  const [candidateSortAsc, setCandidateSortAsc] = useState(true);

  // Question analysis inspection & expanded distribution
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Student submission inspection modal
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<StudentSubmissionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Integrity Timeline Modal
  const [integrityModalAttemptId, setIntegrityModalAttemptId] = useState<string | null>(null);
  const [integrityModalCandidateName, setIntegrityModalCandidateName] = useState<string>("");
  const [integrityModalRollNumber, setIntegrityModalRollNumber] = useState<string>("");

  const openIntegrityModal = (attemptId: string, name?: string, roll?: string) => {
    setIntegrityModalAttemptId(attemptId);
    setIntegrityModalCandidateName(name || "Candidate");
    setIntegrityModalRollNumber(roll || "");
  };

  useEffect(() => {
    loadAllTests();
  }, []);

  useEffect(() => {
    if (initialTestId) {
      setSelectedTestId(initialTestId);
      setShowPaperPicker(false);
    }
  }, [initialTestId]);

  useEffect(() => {
    if (selectedTestId) {
      loadTestAnalytics(selectedTestId);
    } else {
      setAnalytics(null);
    }
  }, [selectedTestId]);

  // Silent background auto-refresh for live exam submissions and scores
  useAdminAutoRefresh({
    intervalMs: 5000,
    enabled: Boolean(selectedTestId) && !selectedAttemptId && !integrityModalAttemptId && !showPaperPicker,
    onRefresh: () => {
      if (selectedTestId) {
        loadTestAnalytics(selectedTestId, true);
      }
    },
  });

  const loadAllTests = async () => {
    try {
      setLoadingTests(true);
      const res = await api.listTests({ page_size: 100 });
      const items = res.items || [];
      setTests(items);
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.status === 499 || e?.status === 401 || e?.message?.includes("Failed to fetch") || e?.isNetworkError) {
        return;
      }
      console.error("Failed to load tests:", e);
    } finally {
      setLoadingTests(false);
    }
  };

  const loadTestAnalytics = async (testId: string, isSilentRefresh = false) => {
    try {
      if (isSilentRefresh) {
        setRefreshing(true);
      } else {
        setLoadingAnalytics(true);
      }
      setError(null);
      const data = await api.getTestAnalytics(testId);
      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || "Failed to load examination analytics.");
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
      setRefreshing(false);
    }
  };

  const handleExportCandidatesCsv = async () => {
    if (!selectedTestId) return;
    try {
      setExportingCandidates(true);
      await api.exportCandidatesCsv(selectedTestId, analytics?.test_code || "test");
    } catch (err: any) {
      alert(err.message || "Failed to export candidates CSV.");
    } finally {
      setExportingCandidates(false);
    }
  };

  const handleExportQuestionsCsv = async () => {
    if (!selectedTestId) return;
    try {
      setExportingQuestions(true);
      await api.exportQuestionsCsv(selectedTestId, analytics?.test_code || "test");
    } catch (err: any) {
      alert(err.message || "Failed to export question analysis CSV.");
    } finally {
      setExportingQuestions(false);
    }
  };

  const selectTest = (testId: string) => {
    setSelectedTestId(testId);
    setShowPaperPicker(false);
    router.push(`/admin/results?test_id=${testId}`);
  };

  const openStudentDetail = async (attemptId: string) => {
    setSelectedAttemptId(attemptId);
    setLoadingDetail(true);
    try {
      const detail = await api.getStudentSubmissionDetail(attemptId);
      setSubmissionDetail(detail);
    } catch (err: any) {
      alert(err.message || "Failed to load candidate submission script.");
      setSelectedAttemptId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatSeconds = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const currentTest = useMemo(() => {
    return tests.find((t) => t.id === selectedTestId);
  }, [tests, selectedTestId]);

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesSearch =
        t.title.toLowerCase().includes(testSearch.toLowerCase()) ||
        t.code.toLowerCase().includes(testSearch.toLowerCase()) ||
        (t.subject_name && t.subject_name.toLowerCase().includes(testSearch.toLowerCase()));
      const matchesStatus =
        testStatusFilter === "ALL" ||
        t.status === testStatusFilter ||
        (testStatusFilter === "LIVE" && (t.status === "LIVE" || t.status === "PUBLISHED"));
      return matchesSearch && matchesStatus;
    });
  }, [tests, testSearch, testStatusFilter]);

  const filteredCandidates = useMemo(() => {
    if (!analytics?.student_submissions) return [];
    let list = analytics.student_submissions.filter((s) => {
      const q = candidateSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.student_name.toLowerCase().includes(q) ||
        (s.roll_number && s.roll_number.toLowerCase().includes(q));

      // Status filter: handle SUBMITTED vs COMPLETED gracefully
      const isCompleted = s.status === "SUBMITTED" || s.status === "COMPLETED" || (!s.status && Boolean(s.submitted_at));
      let matchesStatus = true;
      if (candidateStatusFilter === "SUBMITTED") {
        matchesStatus = isCompleted;
      } else if (candidateStatusFilter === "IN_PROGRESS") {
        matchesStatus = s.status === "IN_PROGRESS";
      } else if (candidateStatusFilter === "EXPIRED") {
        matchesStatus = s.status === "EXPIRED";
      }

      // Integrity filter
      let matchesIntegrity = true;
      if (candidateIntegrityFilter === "REVIEW") {
        matchesIntegrity = Boolean(s.review_recommended);
      } else if (candidateIntegrityFilter === "EVENTS") {
        matchesIntegrity = (s.integrity_events_count ?? 0) > 0;
      } else if (candidateIntegrityFilter === "CLEAN") {
        matchesIntegrity = !s.review_recommended && (s.integrity_events_count ?? 0) === 0;
      }

      // Score tier filter
      let matchesScore = true;
      const pct = s.percentage ?? 0;
      if (candidateScoreFilter === "HIGH") {
        matchesScore = pct >= 75;
      } else if (candidateScoreFilter === "MID") {
        matchesScore = pct >= 40 && pct < 75;
      } else if (candidateScoreFilter === "LOW") {
        matchesScore = pct < 40;
      }

      return matchesSearch && matchesStatus && matchesIntegrity && matchesScore;
    });

    list = [...list].sort((a, b) => {
      let aVal: any = a[candidateSortField];
      let bVal: any = b[candidateSortField];
      if (candidateSortField === "submitted_at") {
        aVal = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        bVal = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      }
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;

      if (aVal < bVal) return candidateSortAsc ? -1 : 1;
      if (aVal > bVal) return candidateSortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    analytics,
    candidateSearch,
    candidateStatusFilter,
    candidateIntegrityFilter,
    candidateScoreFilter,
    candidateSortField,
    candidateSortAsc,
  ]);

  const hasActiveCandidateFilters =
    Boolean(candidateSearch.trim()) ||
    candidateStatusFilter !== "ALL" ||
    candidateIntegrityFilter !== "ALL" ||
    candidateScoreFilter !== "ALL";

  const clearCandidateFilters = () => {
    setCandidateSearch("");
    setCandidateStatusFilter("ALL");
    setCandidateIntegrityFilter("ALL");
    setCandidateScoreFilter("ALL");
  };

  const toggleSort = (field: "rank" | "score" | "percentage" | "time_taken_seconds" | "submitted_at") => {
    if (candidateSortField === field) {
      setCandidateSortAsc(!candidateSortAsc);
    } else {
      setCandidateSortField(field);
      setCandidateSortAsc(field === "rank");
    }
  };

  const isTestLive =
    analytics?.test_status === "LIVE" ||
    currentTest?.status === "LIVE" ||
    currentTest?.status === "PUBLISHED";

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "5rem" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Examinations", href: "/admin/tests" },
          { label: "Results & Analytics" },
        ]}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: "1rem",
          marginBottom: "1.75rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <h1 style={{ fontSize: "1.85rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
              Examination Results & Analytics
            </h1>
            {isTestLive && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  color: "#34d399",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "#34d399",
                    boxShadow: "0 0 8px #34d399",
                  }}
                />
                LIVE MONITORING
              </span>
            )}
          </div>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Select an examination paper to inspect performance overview KPIs, student results & answer scripts, question difficulty analysis, and CSV exports.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {selectedTestId && (
            <>
              <button
                onClick={() => loadTestAnalytics(selectedTestId, true)}
                className="btn btn-secondary btn-sm"
                disabled={refreshing}
                title="Refresh metrics from server"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <RotateCw size={14} className={refreshing ? "animate-spin" : ""} />
                <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
              </button>

              <NextLink
                href={`/admin/tests/${selectedTestId}`}
                className="btn btn-secondary btn-sm"
                title="Open this examination in the test editor"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <ExternalLink size={14} />
                <span>Test Editor</span>
              </NextLink>

              <button
                onClick={() => setShowPaperPicker(!showPaperPicker)}
                className="btn btn-primary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Layers size={14} />
                <span>{showPaperPicker ? "Hide Papers" : "Change Paper"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showPaperPicker && (
        <div
          className="card"
          style={{
            padding: "1.5rem",
            marginBottom: "2rem",
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                Select an Examination Paper
              </h2>
              <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Click any examination paper to view detailed real-time grading, metrics, candidate answer scripts, and question analysis.
              </p>
            </div>

            {selectedTestId && (
              <button
                onClick={() => setShowPaperPicker(false)}
                className="btn btn-secondary btn-sm"
              >
                Close Picker
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 260px" }}>
              <Search
                size={15}
                style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
              />
              <input
                type="text"
                placeholder="Search tests by title, code, or subject..."
                className="input"
                value={testSearch}
                onChange={(e) => setTestSearch(e.target.value)}
                style={{ paddingLeft: "2.3rem", fontSize: "0.88rem" }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {["ALL", "LIVE", "COMPLETED", "SCHEDULED", "DRAFT"].map((status) => (
                <button
                  key={status}
                  onClick={() => setTestStatusFilter(status)}
                  className={`btn btn-sm ${testStatusFilter === status ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "0.78rem", fontWeight: 600 }}
                >
                  {status === "ALL" ? "All Papers" : status}
                </button>
              ))}
            </div>
          </div>

          {loadingTests ? (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
              Loading examination list...
            </div>
          ) : filteredTests.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
                gap: "1rem",
                maxHeight: "380px",
                overflowY: "auto",
                paddingRight: "0.3rem",
              }}
            >
              {filteredTests.map((t) => {
                const isSelected = t.id === selectedTestId;
                const statusBadge =
                  t.status === "LIVE" || t.status === "PUBLISHED"
                    ? { bg: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "rgba(16, 185, 129, 0.3)" }
                    : t.status === "COMPLETED"
                    ? { bg: "rgba(99, 102, 241, 0.12)", color: "var(--primary-600)", border: "rgba(99, 102, 241, 0.3)" }
                    : t.status === "SCHEDULED"
                    ? { bg: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "rgba(245, 158, 11, 0.3)" }
                    : { bg: "var(--bg-surface-hover)", color: "var(--text-muted)", border: "var(--border-color)" };
                return (
                  <div
                    key={t.id}
                    onClick={() => selectTest(t.id)}
                    style={{
                      padding: "1rem 1.15rem",
                      borderRadius: "10px",
                      background: isSelected ? "rgba(99, 102, 241, 0.1)" : "var(--bg-surface)",
                      border: isSelected ? "1.5px solid var(--primary-500)" : "1px solid var(--border-color)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.5rem",
                            borderRadius: "4px",
                            background: statusBadge.bg,
                            color: statusBadge.color,
                            border: `1px solid ${statusBadge.border}`,
                          }}
                        >
                          {t.status}
                        </span>
                        <span style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>
                          {t.code}
                        </span>
                      </div>

                      <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-main)", margin: "0 0 0.35rem 0", lineHeight: 1.3 }}>
                        {t.title}
                      </h3>

                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", gap: "0.8rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                        <span>📚 {t.subject_name || "General"}</span>
                        <span>⏱ {t.duration_minutes}m</span>
                        <span>❓ {t.question_count || 0} Qs</span>
                        <span>🎯 {t.total_marks || 0} Marks</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.6rem", borderTop: "1px solid var(--border-color)" }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                        👥 {t.total_participants ?? t.attempts_count ?? 0} attempts
                      </span>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: isSelected ? "var(--primary-600)" : "var(--primary-500)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.2rem",
                        }}
                      >
                        {isSelected ? "Active View" : "View Results →"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
              No examination papers found matching filter.
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "8px",
            color: "var(--danger)",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loadingAnalytics ? (
        <div className="card" style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>
          <RotateCw size={28} className="animate-spin" style={{ margin: "0 auto 1rem auto", opacity: 0.6 }} />
          <div>Loading examination analytics, candidate scores, and question statistics...</div>
        </div>
      ) : !selectedTestId ? (
        <div
          className="card"
          style={{
            padding: "3.5rem 2rem",
            textAlign: "center",
            maxWidth: "600px",
            margin: "2rem auto",
            border: "1px dashed var(--border-color)",
          }}
        >
          <BarChart3 size={44} style={{ color: "#6366f1", margin: "0 auto 1rem auto", opacity: 0.8 }} />
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-main)", margin: "0 0 0.5rem 0" }}>
            No Examination Paper Selected
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            To inspect question-wise performance, candidate rankings, and score distributions, please select an examination paper from the list above.
          </p>
          <button
            onClick={() => setShowPaperPicker(true)}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Layers size={16} />
            <span>Select Examination Paper</span>
          </button>
        </div>
      ) : analytics ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          <div
            className="card"
            style={{
              padding: "1rem 1.35rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              background: "var(--bg-surface-elevated)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "4px",
                  background: isTestLive ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)",
                  color: isTestLive ? "var(--success)" : "var(--primary-600)",
                }}
              >
                {analytics.test_status || currentTest?.status || "EXAMINATION"}
              </span>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                {analytics.test_title}
              </h2>
              <span style={{ fontSize: "0.85rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                ({analytics.test_code})
              </span>
              {analytics.subject_name && (
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", background: "var(--bg-surface-hover)", border: "1px solid var(--border-color)", padding: "0.15rem 0.5rem", borderRadius: "4px" }}>
                  📚 {analytics.subject_name}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={() => setShowPaperPicker(true)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.8rem" }}
              >
                Switch Paper
              </button>
            </div>
          </div>

          {isTestLive && (
            <div
              className="card"
              style={{
                padding: "1rem 1.25rem",
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Radio size={18} style={{ color: "#34d399" }} />
                <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text-main)" }}>
                  Live Examination Active — {analytics.in_progress_count ?? 0} candidate(s) currently answering questions.
                </span>
              </div>
              <button
                onClick={() => loadTestAnalytics(selectedTestId, true)}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: "0.78rem" }}
              >
                Refresh Live Counts
              </button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setActiveTab("OVERVIEW")}
                className={`btn btn-sm ${activeTab === "OVERVIEW" ? "btn-primary" : "btn-secondary"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}
              >
                <BarChart3 size={15} />
                <span>Overview</span>
              </button>

              <button
                onClick={() => setActiveTab("STUDENTS")}
                className={`btn btn-sm ${activeTab === "STUDENTS" ? "btn-primary" : "btn-secondary"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}
              >
                <Users size={15} />
                <span>Student Results ({analytics.student_submissions?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab("QUESTIONS")}
                className={`btn btn-sm ${activeTab === "QUESTIONS" ? "btn-primary" : "btn-secondary"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}
              >
                <HelpCircle size={15} />
                <span>Question Analysis ({analytics.question_performance?.length || 0})</span>
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              {activeTab === "STUDENTS" && (
                <button
                  onClick={handleExportCandidatesCsv}
                  disabled={exportingCandidates || !analytics.student_submissions?.length}
                  className="btn btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#34d399", borderColor: "rgba(16, 185, 129, 0.3)" }}
                  title="Export candidate rows as UTF-8 CSV"
                >
                  <Download size={14} className={exportingCandidates ? "animate-spin" : ""} />
                  <span>{exportingCandidates ? "Exporting..." : "Export CSV"}</span>
                </button>
              )}

              {activeTab === "QUESTIONS" && (
                <button
                  onClick={handleExportQuestionsCsv}
                  disabled={exportingQuestions || !analytics.question_performance?.length}
                  className="btn btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#60a5fa", borderColor: "rgba(96, 165, 250, 0.3)" }}
                  title="Export item difficulty analysis as UTF-8 CSV"
                >
                  <FileSpreadsheet size={14} className={exportingQuestions ? "animate-spin" : ""} />
                  <span>{exportingQuestions ? "Exporting..." : "Export Question Analysis"}</span>
                </button>
              )}

              {activeTab === "OVERVIEW" && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    onClick={handleExportCandidatesCsv}
                    disabled={exportingCandidates || !analytics.student_submissions?.length}
                    className="btn btn-secondary btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}
                  >
                    <Download size={13} />
                    <span>Export Candidates</span>
                  </button>
                  <button
                    onClick={handleExportQuestionsCsv}
                    disabled={exportingQuestions || !analytics.question_performance?.length}
                    className="btn btn-secondary btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}
                  >
                    <FileSpreadsheet size={13} />
                    <span>Export Questions</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {activeTab === "OVERVIEW" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h2 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                    Test Performance Overview
                  </h2>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-subtle)" }}>
                    Scores derived strictly from finalized/submitted attempts
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "0.85rem",
                  }}
                >
                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Total Participants</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-main)", marginTop: "0.2rem" }}>
                      {analytics.total_participants}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Total candidate starts
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Submitted</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#34d399", marginTop: "0.2rem" }}>
                      {analytics.completed_submissions}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Submission rate: {analytics.submission_rate ?? analytics.completion_rate}%
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>In Progress</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fbbf24", marginTop: "0.2rem" }}>
                      {analytics.in_progress_count ?? 0}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Active test sessions
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Average Score</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--primary-600)", marginTop: "0.2rem" }}>
                      {analytics.average_score}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Avg: {analytics.average_percentage}%
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Average Accuracy</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#38bdf8", marginTop: "0.2rem" }}>
                      {analytics.average_accuracy ?? 0.0}%
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Correct / attempted
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Highest Score</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#34d399", marginTop: "0.2rem" }}>
                      {analytics.highest_score}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Top candidate mark
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Lowest Score</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f87171", marginTop: "0.2rem" }}>
                      {analytics.lowest_score}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Minimum recorded mark
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Median Score</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#c084fc", marginTop: "0.2rem" }}>
                      {analytics.median_score}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      50th percentile mark
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Test Metadata</span>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", marginTop: "0.3rem" }}>
                      {analytics.total_marks ?? currentTest?.total_marks ?? 0} Marks
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      {analytics.total_questions ?? currentTest?.question_count ?? 0} Questions • {analytics.duration_minutes ?? currentTest?.duration_minutes ?? 0} mins
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.1rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Integrity Status</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: (analytics.student_submissions?.filter(s => s.review_recommended).length ?? 0) > 0 ? "#fbbf24" : "#34d399", marginTop: "0.2rem" }}>
                      {analytics.student_submissions?.filter(s => s.review_recommended).length ?? 0}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                      Reviews recommended
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.35rem" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                    Score Distribution
                  </h3>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {analytics.completed_submissions} submitted
                  </span>
                </div>
                <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  Visual candidate distribution across performance scoring brackets (0–20%, 21–40%, etc.).
                </p>

                {analytics.completed_submissions > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {analytics.score_distribution?.map((b) => (
                      <div key={b.range_label}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.25rem" }}>
                          <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{b.range_label}</span>
                          <span style={{ color: "var(--text-muted)" }}>
                            {b.count} candidate{b.count === 1 ? "" : "s"} ({b.percentage}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: "10px",
                            background: "var(--bg-surface-hover, rgba(0, 0, 0, 0.06))",
                            border: "1px solid var(--border-color)",
                            borderRadius: "9999px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${b.percentage}%`,
                              background:
                                b.percentage > 0
                                  ? "linear-gradient(90deg, #6366f1, #818cf8)"
                                  : "transparent",
                              borderRadius: "9999px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No finalized submissions yet. Score distribution will appear as candidates complete the exam.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "STUDENTS" && (
            <div className="card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                    Student-Wise Results & Answer Scripts
                  </h3>
                  <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Click candidate row or View Script to inspect their evaluated responses and question-by-question marks.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ position: "relative", minWidth: "180px", maxWidth: "240px", flex: "1 1 180px" }}>
                    <Search
                      size={14}
                      style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                    />
                    <input
                      type="text"
                      placeholder="Search candidate or roll #..."
                      className="input"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      style={{ paddingLeft: "2.1rem", fontSize: "0.82rem", height: "34px", width: "100%" }}
                    />
                    {candidateSearch && (
                      <button
                        onClick={() => setCandidateSearch("")}
                        style={{
                          position: "absolute",
                          right: "0.5rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "0.2rem",
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <select
                    className="input"
                    value={candidateStatusFilter}
                    onChange={(e: any) => setCandidateStatusFilter(e.target.value)}
                    style={{ height: "34px", fontSize: "0.82rem", fontWeight: 600, padding: "0 0.75rem", minWidth: "140px" }}
                    title="Filter by candidate session status"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SUBMITTED">Completed / Submitted</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="EXPIRED">Expired</option>
                  </select>

                  <select
                    className="input"
                    value={candidateIntegrityFilter}
                    onChange={(e: any) => setCandidateIntegrityFilter(e.target.value)}
                    style={{ height: "34px", fontSize: "0.82rem", fontWeight: 600, padding: "0 0.75rem", minWidth: "145px" }}
                    title="Filter by session integrity and proctoring events"
                  >
                    <option value="ALL">All Integrity</option>
                    <option value="REVIEW">⚠️ Review Recommended</option>
                    <option value="EVENTS">🛡️ Events Detected</option>
                    <option value="CLEAN">✓ Normal / Clean</option>
                  </select>

                  <select
                    className="input"
                    value={candidateScoreFilter}
                    onChange={(e: any) => setCandidateScoreFilter(e.target.value)}
                    style={{ height: "34px", fontSize: "0.82rem", fontWeight: 600, padding: "0 0.75rem", minWidth: "135px" }}
                    title="Filter by percentage score tiers"
                  >
                    <option value="ALL">All Scores</option>
                    <option value="HIGH">Top (≥ 75%)</option>
                    <option value="MID">Average (40%–74%)</option>
                    <option value="LOW">Low (&lt; 40%)</option>
                  </select>

                  {hasActiveCandidateFilters && (
                    <button
                      onClick={clearCandidateFilters}
                      className="btn btn-secondary btn-sm"
                      style={{
                        height: "34px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0 0.65rem",
                        color: "var(--primary-400)",
                        borderColor: "rgba(124, 58, 237, 0.3)",
                      }}
                      title="Clear active student filters"
                    >
                      <X size={13} />
                      <span>Clear ({filteredCandidates.length}/{analytics.student_submissions?.length || 0})</span>
                    </button>
                  )}
                </div>
              </div>

              {filteredCandidates.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "0.75rem 0.6rem", cursor: "pointer" }} onClick={() => toggleSort("rank")}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                            Rank <ArrowUpDown size={12} />
                          </span>
                        </th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Candidate</th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Roll #</th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Status</th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Integrity</th>
                        <th style={{ padding: "0.75rem 0.6rem", cursor: "pointer" }} onClick={() => toggleSort("score")}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                            Score <ArrowUpDown size={12} />
                          </span>
                        </th>
                        <th style={{ padding: "0.75rem 0.6rem", cursor: "pointer" }} onClick={() => toggleSort("percentage")}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                            Percentage <ArrowUpDown size={12} />
                          </span>
                        </th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Accuracy</th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Correct</th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Incorrect</th>
                        <th style={{ padding: "0.75rem 0.6rem" }}>Unattempted</th>
                        <th style={{ padding: "0.75rem 0.6rem", cursor: "pointer" }} onClick={() => toggleSort("time_taken_seconds")}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                            Time Taken <ArrowUpDown size={12} />
                          </span>
                        </th>
                        <th style={{ padding: "0.75rem 0.6rem", cursor: "pointer" }} onClick={() => toggleSort("submitted_at")}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                            Submitted At <ArrowUpDown size={12} />
                          </span>
                        </th>
                        <th style={{ padding: "0.75rem 0.6rem", textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.map((stud) => {
                        const isCompleted = stud.status === "SUBMITTED" || stud.status === "COMPLETED";
                        return (
                          <tr key={stud.attempt_id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <td style={{ padding: "0.85rem 0.6rem" }}>
                              {isCompleted ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "50%",
                                    background:
                                      stud.rank === 1
                                        ? "#fbbf24"
                                        : stud.rank === 2
                                        ? "#cbd5e1"
                                        : stud.rank === 3
                                        ? "#b45309"
                                        : "rgba(255, 255, 255, 0.06)",
                                    color: stud.rank <= 3 ? "#000000" : "var(--text-main)",
                                    fontWeight: 700,
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  {stud.rank}
                                </span>
                              ) : (
                                <span style={{ color: "var(--text-subtle)", fontSize: "0.8rem" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", fontWeight: 600, color: "var(--text-main)" }}>
                              {stud.student_name}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", fontFamily: "monospace", fontSize: "0.82rem", color: "var(--primary-600)" }}>
                              {stud.roll_number || "—"}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem" }}>
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  padding: "0.15rem 0.5rem",
                                  borderRadius: "4px",
                                  background: isCompleted
                                    ? "rgba(16, 185, 129, 0.15)"
                                    : stud.status === "IN_PROGRESS"
                                    ? "rgba(245, 158, 11, 0.15)"
                                    : "rgba(239, 68, 68, 0.15)",
                                  color: isCompleted ? "#34d399" : stud.status === "IN_PROGRESS" ? "#fbbf24" : "#f87171",
                                }}
                              >
                                {stud.status || "SUBMITTED"}
                              </span>
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem" }}>
                              {stud.review_recommended ? (
                                <button
                                  onClick={() => openIntegrityModal(stud.attempt_id, stud.student_name, stud.roll_number)}
                                  title="Detected activity triggers review recommendation"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    padding: "0.15rem 0.5rem",
                                    borderRadius: "4px",
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "#fbbf24",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                    cursor: "pointer",
                                  }}
                                >
                                  <ShieldAlert size={12} />
                                  <span>Review ({stud.integrity_events_count ?? 0})</span>
                                </button>
                              ) : (stud.integrity_events_count ?? 0) > 0 ? (
                                <button
                                  onClick={() => openIntegrityModal(stud.attempt_id, stud.student_name, stud.roll_number)}
                                  title="View audit event log"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    background: "rgba(255, 255, 255, 0.06)",
                                    color: "var(--text-muted)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Shield size={12} />
                                  <span>{stud.integrity_events_count} events</span>
                                </button>
                              ) : (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.2rem",
                                    fontSize: "0.72rem",
                                    color: "#34d399",
                                  }}
                                >
                                  <Check size={12} />
                                  <span>Normal</span>
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", fontWeight: 700, color: isCompleted ? "#34d399" : "#94a3b8", fontSize: "0.95rem" }}>
                              {stud.score} / {stud.total_marks}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", fontWeight: 600, color: "var(--text-main)" }}>
                              {stud.percentage}%
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", color: "#38bdf8", fontWeight: 600 }}>
                              {stud.accuracy !== undefined ? `${stud.accuracy}%` : "—"}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", color: "#34d399" }}>
                              {stud.correct_count}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", color: "#f87171" }}>
                              {stud.incorrect_count}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", color: "var(--text-muted)" }}>
                              {stud.unattempted_count}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                              {formatSeconds(stud.time_taken_seconds)}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", color: "var(--text-subtle)", fontSize: "0.78rem" }}>
                              {stud.submitted_at
                                ? new Date(stud.submitted_at).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </td>
                            <td style={{ padding: "0.85rem 0.6rem", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                                <button
                                  onClick={() => openStudentDetail(stud.attempt_id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                                >
                                  View Script
                                </button>
                                <button
                                  onClick={() => openIntegrityModal(stud.attempt_id, stud.student_name, stud.roll_number)}
                                  className="btn btn-secondary btn-sm"
                                  title="View audit event timeline"
                                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.45rem" }}
                                >
                                  <Shield size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                  <Users size={32} style={{ color: "var(--text-subtle)", opacity: 0.6 }} />
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: "var(--text-main)" }}>No candidates found</p>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      No student submissions match the selected filter criteria.
                    </p>
                  </div>
                  {hasActiveCandidateFilters && (
                    <button
                      onClick={clearCandidateFilters}
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: "0.25rem", fontWeight: 600 }}
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "QUESTIONS" && (
            <div className="card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                    Question-Level Performance & Difficulty Analysis
                  </h3>
                  <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Item analysis based on candidate responses: accuracy, empirical difficulty (Easy, Moderate, Difficult), and option response distribution.
                  </p>
                </div>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {analytics.question_performance?.length || 0} Questions Total
                </span>
              </div>

              {analytics.question_performance && analytics.question_performance.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Q#</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Type</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Marks</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Question Preview</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Attempted</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Correct</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Incorrect</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Unattempted</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Accuracy</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Avg Marks</th>
                          <th style={{ padding: "0.75rem 0.6rem" }}>Difficulty</th>
                          <th style={{ padding: "0.75rem 0.6rem", textAlign: "right" }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.question_performance.map((qp) => {
                          const diff = qp.difficulty || "MODERATE";
                          const diffColor =
                            diff === "EASY" ? "#34d399" : diff === "DIFFICULT" || diff === "HARD" ? "#f87171" : "#60a5fa";
                          const isExpanded = expandedQuestionId === qp.question_id;
                          return (
                            <React.Fragment key={qp.question_id}>
                              <tr
                                style={{
                                  borderBottom: isExpanded ? "none" : "1px solid var(--border-color)",
                                  background: isExpanded ? "var(--bg-surface-elevated)" : "transparent",
                                }}
                              >
                                <td style={{ padding: "0.8rem 0.6rem", fontWeight: 700, color: "var(--primary-600)" }}>
                                  Q{qp.order_index}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  <span style={{ background: "var(--bg-surface-elevated)", padding: "0.2rem 0.45rem", borderRadius: "4px" }}>
                                    {qp.question_type}
                                  </span>
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "var(--text-main)", fontWeight: 500 }}>
                                  {qp.max_marks ?? 4.0}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "var(--text-main)", maxWidth: "260px" }}>
                                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    <MathRenderer text={qp.preview} />
                                  </div>
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "var(--text-main)", fontWeight: 500 }}>
                                  {qp.attempted_count ?? (qp.total_attempts - (qp.unattempted_count ?? 0))}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "#34d399", fontWeight: 700 }}>
                                  {qp.correct_count ?? Math.round((qp.correct_percentage * qp.total_attempts) / 100)}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "#f87171", fontWeight: 600 }}>
                                  {qp.incorrect_count ?? 0}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "var(--text-muted)" }}>
                                  {qp.unattempted_count ?? 0}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "#38bdf8", fontWeight: 700 }}>
                                  {qp.accuracy_percentage ?? qp.correct_percentage}%
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", color: "#e2e8f0", fontWeight: 600 }}>
                                  {qp.average_marks !== undefined ? qp.average_marks.toFixed(2) : "—"}
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem" }}>
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      padding: "0.15rem 0.5rem",
                                      borderRadius: "4px",
                                      background: `rgba(${diff === "EASY" ? "16, 185, 129" : diff === "DIFFICULT" || diff === "HARD" ? "239, 68, 68" : "96, 165, 250"}, 0.15)`,
                                      color: diffColor,
                                    }}
                                  >
                                    {diff}
                                  </span>
                                </td>
                                <td style={{ padding: "0.8rem 0.6rem", textAlign: "right" }}>
                                  <button
                                    onClick={() => setExpandedQuestionId(isExpanded ? null : qp.question_id)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                                  >
                                    <span>{isExpanded ? "Hide" : "Analyze"}</span>
                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-surface-elevated)" }}>
                                  <td colSpan={12} style={{ padding: "1rem 1.25rem" }}>
                                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "1.1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                      <div style={{ marginBottom: "0.75rem" }}>
                                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                                          Full Question Content
                                        </span>
                                        <div style={{ fontSize: "0.95rem", color: "var(--text-main)", marginTop: "0.25rem", lineHeight: 1.5 }}>
                                          <MathRenderer text={qp.preview} />
                                        </div>
                                      </div>

                                      {qp.option_distribution && qp.option_distribution.length > 0 ? (
                                        <div style={{ marginTop: "1rem" }}>
                                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                                            Candidate Response Distribution ({qp.total_attempts} total responses)
                                          </span>
                                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                            {qp.option_distribution.map((opt) => (
                                              <div key={opt.option_id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                                                <span
                                                  style={{
                                                    width: "28px",
                                                    fontWeight: 700,
                                                    color: opt.is_correct ? "#34d399" : "var(--text-main)",
                                                  }}
                                                >
                                                  Opt {opt.option_label}
                                                  {opt.is_correct && " ✓"}
                                                </span>
                                                <div style={{ flex: 1, height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                                                  <div
                                                    style={{
                                                      height: "100%",
                                                      width: `${opt.selection_percentage}%`,
                                                      background: opt.is_correct ? "#34d399" : "#818cf8",
                                                      borderRadius: "4px",
                                                    }}
                                                  />
                                                </div>
                                                <span style={{ minWidth: "120px", fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "right" }}>
                                                  {opt.selection_count} candidates ({opt.selection_percentage}%)
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : qp.question_type === "NUMERICAL" ? (
                                        <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                          <span>Numerical Item Analysis:</span>{" "}
                                          <strong style={{ color: "var(--text-main)" }}>
                                            {qp.average_numerical_value !== undefined && qp.average_numerical_value !== null
                                              ? `Average candidate submitted value: ${qp.average_numerical_value}`
                                              : "No numerical responses recorded"}
                                          </strong>
                                        </div>
                                      ) : (
                                        <div style={{ marginTop: "0.75rem", fontSize: "0.82rem", color: "var(--text-subtle)" }}>
                                          No option distribution available for this item type.
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                  No question-level performance data is available.
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {selectedAttemptId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => setSelectedAttemptId(null)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "850px",
              maxHeight: "88vh",
              overflowY: "auto",
              padding: "1.75rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "1px solid var(--border-color)",
                paddingBottom: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                  Candidate Answer Script Review
                </h3>
                {submissionDetail ? (
                  <div style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: "0.3rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    <span>
                      Candidate: <strong style={{ color: "var(--text-main)" }}>{submissionDetail.student_name}</strong> ({submissionDetail.roll_number || "Candidate"})
                    </span>
                    <span>
                      Score: <strong style={{ color: "#34d399" }}>{submissionDetail.score} / {submissionDetail.total_marks}</strong> ({submissionDetail.percentage}%)
                    </span>
                    <span>
                      Accuracy: <strong style={{ color: "#38bdf8" }}>{submissionDetail.accuracy}%</strong>
                    </span>
                    <span>
                      Time: <strong style={{ color: "#fbbf24" }}>{formatSeconds(submissionDetail.time_taken_seconds)}</strong>
                    </span>
                    {submissionDetail.integrity_summary && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <button
                          onClick={() => openIntegrityModal(submissionDetail.attempt_id, submissionDetail.student_name, submissionDetail.roll_number)}
                          style={{
                            background: submissionDetail.integrity_summary.review_recommended ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
                            border: submissionDetail.integrity_summary.review_recommended ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(16, 185, 129, 0.4)",
                            color: submissionDetail.integrity_summary.review_recommended ? "#fbbf24" : "#34d399",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <Shield size={12} />
                          <span>
                            {submissionDetail.integrity_summary.review_recommended ? "Review Recommended" : "Session Integrity Normal"} ({submissionDetail.integrity_summary.total_events} events)
                          </span>
                        </button>
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Loading answer responses...
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedAttemptId(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0.25rem" }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>
                <RotateCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem auto" }} />
                <div>Retrieving evaluated answer script...</div>
              </div>
            ) : submissionDetail ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  maxHeight: "60vh",
                  overflowY: "auto",
                  paddingRight: "0.25rem",
                }}
              >
                {submissionDetail.answers.map((ans) => {
                  const isCorrect = ans.is_correct;
                  const isUnattempted = !ans.student_answer || ans.student_answer === "Unattempted";
                  return (
                    <div
                      key={ans.question_id}
                      style={{
                        padding: "1.1rem",
                        borderRadius: "8px",
                        border: "1px solid",
                        borderColor: isCorrect
                          ? "rgba(16, 185, 129, 0.3)"
                          : isUnattempted
                          ? "rgba(148, 163, 184, 0.2)"
                          : "rgba(239, 68, 68, 0.3)",
                        background: isCorrect
                          ? "rgba(16, 185, 129, 0.04)"
                          : isUnattempted
                          ? "rgba(255, 255, 255, 0.02)"
                          : "rgba(239, 68, 68, 0.04)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.95rem" }}>
                          Question {ans.order_index} <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>({ans.question_type})</span>
                        </span>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.55rem",
                            borderRadius: "4px",
                            background: isCorrect
                              ? "rgba(16, 185, 129, 0.15)"
                              : isUnattempted
                              ? "rgba(148, 163, 184, 0.15)"
                              : "rgba(239, 68, 68, 0.15)",
                            color: isCorrect ? "#34d399" : isUnattempted ? "#94a3b8" : "#f87171",
                          }}
                        >
                          {isCorrect
                            ? `+${ans.marks_awarded} Marks`
                            : isUnattempted
                            ? "0 Marks (Unattempted)"
                            : `${ans.marks_awarded} Marks (Incorrect)`}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.92rem", color: "var(--text-main)", marginBottom: "0.85rem", lineHeight: 1.5 }}>
                        <MathRenderer text={ans.question_content} />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.75rem",
                          fontSize: "0.85rem",
                          background: "rgba(0, 0, 0, 0.3)",
                          padding: "0.75rem 0.95rem",
                          borderRadius: "6px",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                        }}
                      >
                        <div>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: "0.2rem" }}>
                            Candidate's Response:
                          </span>
                          <strong style={{ color: isCorrect ? "#34d399" : isUnattempted ? "var(--text-subtle)" : "#f87171" }}>
                            <MathRenderer inline text={ans.student_answer || "Unattempted / Left Blank"} />
                          </strong>
                        </div>

                        <div>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: "0.2rem" }}>
                            Official Correct Answer:
                          </span>
                          <strong style={{ color: "#34d399" }}>
                            <MathRenderer inline text={ans.correct_answer || "—"} />
                          </strong>
                        </div>
                      </div>

                      {ans.explanation && (
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "var(--text-muted)",
                            marginTop: "0.75rem",
                            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                            paddingTop: "0.5rem",
                          }}
                        >
                          <strong style={{ color: "#cbd5e1" }}>Solution / Explanation:</strong>{" "}
                          <MathRenderer text={ans.explanation} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-color)", paddingTop: "0.85rem" }}>
              <button onClick={() => setSelectedAttemptId(null)} className="btn btn-secondary">
                Close Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integrity Audit Timeline Modal */}
      <IntegrityTimelineModal
        isOpen={!!integrityModalAttemptId}
        attemptId={integrityModalAttemptId}
        candidateName={integrityModalCandidateName}
        rollNumber={integrityModalRollNumber}
        onClose={() => setIntegrityModalAttemptId(null)}
      />
    </div>
  );
}
