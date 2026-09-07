"use client";

import React, { useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  Test,
  TestAuditLog,
  TestListResponse,
  DashboardStats,
} from "@/lib/api";
import { MathRenderer } from "@/components/MathRenderer";
import {
  FileText,
  Radio,
  Calendar,
  CheckCircle2,
  Users,
  Send,
  Plus,
  Eye,
  BarChart3,
  History,
  Lock,
  ArrowUpRight,
  Clock,
  Sparkles,
  Layers,
  Activity,
  X,
  AlertCircle,
} from "lucide-react";

import { useAdminAutoRefresh } from "@/lib/hooks/useAdminAutoRefresh";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [tests, setTests] = useState<Test[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states for live test quick preview and audit logs
  const [previewTest, setPreviewTest] = useState<Test | null>(null);
  const [auditTest, setAuditTest] = useState<Test | null>(null);
  const [auditLogs, setAuditLogs] = useState<TestAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Active question index in student preview
  const [previewQIndex, setPreviewQIndex] = useState<number>(0);

  useEffect(() => {
    loadOperationalData(true);
  }, []);

  const loadOperationalData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [testsResp, statsResp] = await Promise.all([
        api.listTests({ page_size: 100 }),
        api.getDashboardStats().catch(() => null),
      ]);
      setTests(testsResp.items || []);
      setDashboardStats(statsResp);
    } catch (err: any) {
      if (isInitial) {
        setError(err.message || "Failed to load examination operational metrics");
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // Silent background auto-refresh every 6 seconds (pauses when tab is hidden)
  useAdminAutoRefresh({
    intervalMs: 6000,
    enabled: !previewTest && !auditTest,
    onRefresh: () => loadOperationalData(false),
  });

  const openAuditLogs = async (test: Test) => {
    setAuditTest(test);
    setLoadingAudit(true);
    try {
      const logs = await api.getTestAuditLogs(test.id);
      setAuditLogs(logs);
    } catch (e: any) {
      console.error("Failed to load audit logs", e);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Operational metrics aggregation (harmonized with backend DashboardService)
  const totalTests = dashboardStats?.total_tests ?? tests.length;
  const liveTestsCount = dashboardStats?.live_tests ?? tests.filter((t) => t.status === "LIVE" || t.status === "PUBLISHED").length;
  const scheduledTestsCount = dashboardStats?.scheduled_tests ?? tests.filter((t) => t.status === "SCHEDULED").length;
  const completedTestsCount = dashboardStats?.completed_tests ?? tests.filter((t) => t.status === "COMPLETED" || t.status === "CLOSED").length;

  const liveTests = tests.filter((t) => t.status === "LIVE" || t.status === "PUBLISHED");
  const scheduledTests = tests.filter((t) => t.status === "SCHEDULED");
  const completedTests = tests.filter((t) => t.status === "COMPLETED" || t.status === "CLOSED");
  const draftTests = tests.filter((t) => t.status === "DRAFT");

  const totalParticipants = dashboardStats?.total_candidates ?? tests.reduce(
    (sum, t) => sum + (t.total_participants || 0),
    0
  );
  const totalSubmissions = dashboardStats?.total_submissions ?? tests.reduce(
    (sum, t) => sum + (t.total_submissions || t.attempts_count || 0),
    0
  );

  // Tests Requiring Teacher Attention (e.g., Draft or Scheduled tests with 0 questions)
  const attentionTests = tests.filter((t) => {
    if (t.status === "DRAFT" && (t.question_count === 0 || !t.question_count)) return true;
    if (t.status === "SCHEDULED" && (t.question_count === 0 || !t.question_count)) return true;
    return false;
  });
  const needsAttentionCount = dashboardStats?.needs_attention ?? attentionTests.length;

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "Immediate / Open";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
              Exam Control Dashboard
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.75rem",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
                padding: "0.2rem 0.6rem",
                borderRadius: "9999px",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                }}
              />
              System Operational
            </span>
          </div>
          <p style={{ margin: "0.35rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Monitor live examinations, scheduled papers, and student candidate submissions in real-time.
          </p>
        </div>

        {/* Primary Action Button */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <NextLink
            href="/admin/tests/new"
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", fontWeight: 600 }}
          >
            <Plus size={16} />
            <span>Create Test</span>
          </NextLink>
          <NextLink
            href="/admin/test-series"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <Layers size={16} />
            <span>Test Series</span>
          </NextLink>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "1rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "8px",
            color: "var(--danger)",
            marginBottom: "1.5rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Operational 6-KPI Metric Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2.25rem",
        }}
      >
        {/* Live Tests */}
        <div className="card" style={{ padding: "1.25rem", borderLeft: "3px solid #10b981" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Live Tests</span>
            <div style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", padding: "0.4rem", borderRadius: "8px" }}>
              <Radio size={18} />
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#34d399" }}>
            {loading ? "..." : liveTestsCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Currently receiving attempts
          </div>
        </div>

        {/* Scheduled Tests */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Scheduled</span>
            <div style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", padding: "0.4rem", borderRadius: "8px" }}>
              <Calendar size={18} />
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#60a5fa" }}>
            {loading ? "..." : scheduledTestsCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Upcoming exam windows
          </div>
        </div>

        {/* Completed Tests */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Completed</span>
            <div style={{ background: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", padding: "0.4rem", borderRadius: "8px" }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-main)" }}>
            {loading ? "..." : completedTestsCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Exam windows concluded
          </div>
        </div>

        {/* Total Participants */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Total Candidates</span>
            <div style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", padding: "0.4rem", borderRadius: "8px" }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-main)" }}>
            {loading ? "..." : totalParticipants}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Registered candidate starts
          </div>
        </div>

        {/* Total Submissions */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Total Submissions</span>
            <div style={{ background: "rgba(236, 72, 153, 0.15)", color: "#f472b6", padding: "0.4rem", borderRadius: "8px" }}>
              <Send size={18} />
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-main)" }}>
            {loading ? "..." : totalSubmissions}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Finished exam papers
          </div>
        </div>

        {/* Tests Requiring Attention */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            borderLeft: needsAttentionCount > 0 ? "3px solid #f59e0b" : "1px solid var(--border-color)",
            background: needsAttentionCount > 0 ? "rgba(245, 158, 11, 0.05)" : undefined,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Needs Attention</span>
            <div style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", padding: "0.4rem", borderRadius: "8px" }}>
              <AlertCircle size={18} />
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: needsAttentionCount > 0 ? "#f59e0b" : "var(--text-main)" }}>
            {loading ? "..." : needsAttentionCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            {needsAttentionCount > 0 ? "Papers with 0 questions" : "All test papers ready"}
          </div>
        </div>
      </div>

      {/* OPERATIONAL SECTION: TESTS REQUIRING ATTENTION */}
      {attentionTests.length > 0 && (
        <div
          className="card"
          style={{
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            background: "rgba(245, 158, 11, 0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <AlertCircle size={18} color="#f59e0b" />
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#f59e0b" }}>
                Tests Requiring Attention ({attentionTests.length})
              </h2>
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Test papers currently without questions cannot be administered to candidates
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {attentionTests.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "0.85rem 1rem",
                  background: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text-main)" }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#f87171", marginTop: "0.2rem" }}>
                    0 Questions • Status: <strong>{t.status}</strong>
                  </div>
                </div>

                <NextLink
                  href={`/admin/tests/${t.id}?step=questions&auto_add=true`}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                >
                  <Plus size={12} />
                  <span>Add Questions</span>
                </NextLink>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OPERATIONAL SECTION: LIVE TESTS */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                boxShadow: "0 0 12px #10b981",
              }}
            />
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                Active / Live Examinations
              </h2>
              <p style={{ margin: "0.2rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Tests currently open for student examination. Structural modifications are locked to preserve integrity.
              </p>
            </div>
          </div>
          <span
            style={{
              fontSize: "0.8rem",
              color: "#34d399",
              background: "rgba(16, 185, 129, 0.1)",
              padding: "0.3rem 0.75rem",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Lock size={13} />
            <span>Structural Changes Locked</span>
          </span>
        </div>

        {liveTests.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Test</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Access Code</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Availability</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Participants</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Submissions</th>
                  <th style={{ padding: "0.85rem 0.75rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liveTests.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "1rem 0.75rem" }}>
                      <NextLink
                        href={`/admin/tests/${t.id}`}
                        style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.95rem", textDecoration: "none" }}
                        onMouseOver={(e) => (e.currentTarget.style.color = "var(--primary)")}
                        onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-main)")}
                      >
                        {t.title}
                      </NextLink>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        {t.subject_name || "General"} • {t.duration_minutes} mins • {t.question_count} Questions
                      </div>
                    </td>
                    <td style={{ padding: "1rem 0.75rem" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          background: "rgba(99, 102, 241, 0.15)",
                          color: "var(--primary-600)",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {t.code}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 0.75rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Clock size={13} color="#94a3b8" />
                        <span>{formatDateTime(t.start_time)}</span>
                      </div>
                      {t.end_time && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                          Ends: {formatDateTime(t.end_time)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "1rem 0.75rem", fontWeight: 600, color: "#c084fc" }}>
                      {t.total_participants || 0}
                    </td>
                    <td style={{ padding: "1rem 0.75rem", fontWeight: 600, color: "#34d399" }}>
                      {t.total_submissions || t.attempts_count || 0}
                    </td>
                    <td style={{ padding: "1rem 0.75rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                        {/* Monitor / Manage Live Exam */}
                        <NextLink
                          href={`/admin/tests/${t.id}`}
                          className="btn btn-primary btn-sm"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 600 }}
                          title="Monitor test live, inspect questions, or perform errata corrections"
                        >
                          <Activity size={13} />
                          <span>Monitor</span>
                        </NextLink>

                        {/* Preview Action */}
                        <button
                          onClick={() => {
                            setPreviewTest(t);
                            setPreviewQIndex(0);
                          }}
                          className="btn btn-secondary btn-sm"
                          title="Preview student exam window"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <Eye size={13} />
                          <span>Preview</span>
                        </button>

                        {/* Results Action */}
                        <NextLink
                          href={`/admin/results?test_id=${t.id}`}
                          className="btn btn-secondary btn-sm"
                          title="View test analytics and student rank list"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <BarChart3 size={13} />
                          <span>Results</span>
                        </NextLink>

                        {/* Audit Logs */}
                        <button
                          onClick={() => openAuditLogs(t)}
                          className="btn btn-secondary btn-sm"
                          title="View change audit log"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <History size={13} />
                          <span>Logs</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
            <Activity size={32} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
            <div style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.95rem" }}>
              No Examinations Currently Live
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: "420px", margin: "0.35rem auto 1.25rem auto" }}>
              Ready to conduct an examination? Publish a prepared draft test or schedule a test paper.
            </p>
            <NextLink href="/admin/tests" className="btn btn-secondary btn-sm">
              <span>View All Tests</span>
            </NextLink>
          </div>
        )}
      </div>

      {/* Two Column Layout: Recent Tests and Recent Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Recent Tests Table */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 600, margin: 0, color: "var(--text-main)" }}>
                All Tests Overview
              </h2>
              <p style={{ margin: "0.2rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Recent tests across all statuses
              </p>
            </div>
            <NextLink
              href="/admin/tests"
              style={{
                fontSize: "0.85rem",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                gap: "0.2rem",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <span>View All ({tests.length})</span>
              <ArrowUpRight size={14} />
            </NextLink>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Test Title</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Subject</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Questions</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Status</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tests.slice(0, 6).map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "0.85rem 0.5rem" }}>
                      <NextLink
                        href={`/admin/tests/${t.id}`}
                        style={{ color: "var(--text-main)", fontWeight: 600, textDecoration: "none" }}
                      >
                        {t.title}
                      </NextLink>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "0.15rem" }}>
                        {t.code}
                      </div>
                    </td>
                    <td style={{ padding: "0.85rem 0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      {t.subject_name || "—"}
                    </td>
                    <td style={{ padding: "0.85rem 0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      {t.question_count} Qs
                    </td>
                    <td style={{ padding: "0.85rem 0.5rem" }}>
                      <span
                        className={`badge ${
                          t.status === "LIVE" || t.status === "PUBLISHED"
                            ? "badge-success"
                            : t.status === "SCHEDULED"
                            ? "badge-primary"
                            : t.status === "DRAFT"
                            ? "badge-warning"
                            : "badge"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.85rem 0.5rem", textAlign: "right" }}>
                      <NextLink href={`/admin/tests/${t.id}`} className="btn btn-secondary btn-sm">
                        Open
                      </NextLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Operational Guidelines & Activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0 0 1rem 0", color: "var(--text-main)" }}>
              Examination Flow Guide
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <span style={{ background: "rgba(99, 102, 241, 0.2)", color: "var(--primary-600)", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                  1
                </span>
                <div>
                  <strong style={{ color: "var(--text-main)" }}>Create Test Paper</strong>
                  <div style={{ color: "var(--text-muted)", marginTop: "0.1rem" }}>
                    Configure duration, marks, and topic tags directly.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <span style={{ background: "rgba(99, 102, 241, 0.2)", color: "var(--primary-600)", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                  2
                </span>
                <div>
                  <strong style={{ color: "var(--text-main)" }}>Compose Questions Inline</strong>
                  <div style={{ color: "var(--text-muted)", marginTop: "0.1rem" }}>
                    Add MCQ and numerical questions with LaTeX and diagrams.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <span style={{ background: "rgba(99, 102, 241, 0.2)", color: "var(--primary-600)", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                  3
                </span>
                <div>
                  <strong style={{ color: "var(--text-main)" }}>Preview & Publish</strong>
                  <div style={{ color: "var(--text-muted)", marginTop: "0.1rem" }}>
                    Review in the student exam window and generate access code.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <span style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                  4
                </span>
                <div>
                  <strong style={{ color: "var(--text-main)" }}>Analyze Results</strong>
                  <div style={{ color: "var(--text-muted)", marginTop: "0.1rem" }}>
                    Inspect student score distributions and question difficulty.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Audit Logs */}
      {auditTest && (
        <div className="modal-overlay" onClick={() => setAuditTest(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: "680px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", color: "var(--text-main)" }}>
                  Examination Audit History
                </h3>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  {auditTest.title} ({auditTest.code})
                </div>
              </div>
              <button
                onClick={() => setAuditTest(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingAudit ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                Loading audit trail...
              </div>
            ) : auditLogs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", maxHeight: "60vh", overflowY: "auto" }}>
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: "var(--primary-600)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {log.action}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-main)" }}>
                      {log.details}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                      By: {log.admin_name}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                No audit entries recorded for this test.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Student Exam Preview Window */}
      {previewTest && (
        <div className="modal-overlay" onClick={() => setPreviewTest(null)}>
          <div
            className="modal-content"
            style={{
              maxWidth: "920px",
              padding: "0",
              background: "var(--bg-main)",
              overflow: "hidden",
              borderRadius: "12px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Exam Header */}
            <div
              style={{
                background: "var(--bg-surface-elevated)",
                borderBottom: "1px solid var(--border-color)",
                padding: "0.85rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      background: "rgba(239, 68, 68, 0.2)",
                      color: "#f87171",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px",
                    }}
                  >
                    CBT SIMULATOR
                  </span>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--text-main)" }}>
                    {previewTest.title}
                  </h3>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Code: {previewTest.code} • Duration: {previewTest.duration_minutes} Mins • Total Marks: {previewTest.total_marks}
                </div>
              </div>

              {/* Simulated Countdown Timer */}
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                <div
                  style={{
                    background: "rgba(99, 102, 241, 0.15)",
                    border: "1px solid rgba(99, 102, 241, 0.4)",
                    color: "var(--primary-600)",
                    padding: "0.4rem 0.85rem",
                    borderRadius: "6px",
                    fontFamily: "monospace",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <Clock size={15} />
                  <span>{previewTest.duration_minutes}:00</span>
                </div>
                <button
                  onClick={() => setPreviewTest(null)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Exam Content Body */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", minHeight: "420px" }}>
              {/* Question Window */}
              <div style={{ padding: "1.5rem", borderRight: "1px solid var(--border-color)", overflowY: "auto", maxHeight: "65vh" }}>
                {previewTest.questions && previewTest.questions.length > 0 ? (
                  <div>
                    {(() => {
                      const curTq = previewTest.questions[previewQIndex] || previewTest.questions[0];
                      const q = curTq?.question;
                      if (!q) return <div>Question data unavailable.</div>;

                      return (
                        <div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "1rem",
                              borderBottom: "1px solid var(--border-color)",
                              paddingBottom: "0.6rem",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "1rem" }}>
                              Question {previewQIndex + 1} of {previewTest.questions.length}
                            </span>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              Marks: <strong style={{ color: "#34d399" }}>+{curTq.marks || previewTest.positive_marks}</strong> /{" "}
                              <strong style={{ color: "#f87171" }}>-{curTq.negative_marks || previewTest.negative_marks}</strong>
                            </span>
                          </div>

                          <div
                            style={{
                              fontSize: "1.02rem",
                              lineHeight: 1.6,
                              color: "#f8fafc",
                              marginBottom: "1.5rem",
                            }}
                          >
                            <MathRenderer text={q.content} />
                          </div>

                          {/* Options if MCQ */}
                          {q.options && q.options.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                              {q.options.map((opt, idx) => (
                                <div
                                  key={opt.id || idx}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                    padding: "0.75rem 1rem",
                                    border: "1px solid var(--border-color)",
                                    borderRadius: "8px",
                                    background: "var(--bg-surface-elevated)",
                                    cursor: "pointer",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "20px",
                                      height: "20px",
                                      borderRadius: "50%",
                                      border: "2px solid #475569",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      color: "#94a3b8",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {String.fromCharCode(65 + idx)}
                                  </div>
                                  <div style={{ fontSize: "0.95rem", color: "var(--text-main)", flex: 1, minWidth: 0 }}>
                                    <MathRenderer inline text={opt.content} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Numerical Input if Numerical */}
                          {q.question_type === "NUMERICAL" && (
                            <div style={{ marginBottom: "1.5rem" }}>
                              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                                Enter Numerical Value:
                              </label>
                              <input
                                type="number"
                                placeholder="Type answer..."
                                className="input"
                                style={{ maxWidth: "200px" }}
                                readOnly
                              />
                            </div>
                          )}

                          {/* Navigation Buttons */}
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)" }}>
                            <button
                              onClick={() => setPreviewQIndex(Math.max(0, previewQIndex - 1))}
                              disabled={previewQIndex === 0}
                              className="btn btn-secondary btn-sm"
                            >
                              Previous
                            </button>
                            <button
                              onClick={() => setPreviewQIndex(Math.min(previewTest.questions.length - 1, previewQIndex + 1))}
                              disabled={previewQIndex === previewTest.questions.length - 1}
                              className="btn btn-primary btn-sm"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                    No questions in this test paper yet.
                  </div>
                )}
              </div>

              {/* Question Palette Sidebar */}
              <div style={{ padding: "1rem", background: "var(--bg-surface-elevated)", overflowY: "auto", maxHeight: "65vh" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.75rem", letterSpacing: "0.05em" }}>
                  Question Palette
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.45rem" }}>
                  {previewTest.questions?.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPreviewQIndex(idx)}
                      style={{
                        width: "100%",
                        aspectRatio: "1/1",
                        borderRadius: "6px",
                        border: idx === previewQIndex ? "2px solid #6366f1" : "1px solid var(--border-color)",
                        background: idx === previewQIndex ? "rgba(99, 102, 241, 0.25)" : "var(--bg-surface-elevated)",
                        color: idx === previewQIndex ? "var(--primary-600)" : "var(--text-muted)",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                      }}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                  <button
                    disabled
                    className="btn btn-success"
                    style={{ width: "100%", justifyContent: "center", opacity: 0.7, cursor: "not-allowed" }}
                  >
                    Submit Exam
                  </button>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textAlign: "center", marginTop: "0.4rem" }}>
                    Preview mode • No attempt recorded
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
