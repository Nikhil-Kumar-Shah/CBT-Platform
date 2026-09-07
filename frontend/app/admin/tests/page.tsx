"use client";

import React, { useEffect, useState, useRef } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui";
import { api, Test, Subject, TestSeries, TestAuditLog } from "@/lib/api";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useAdminAutoRefresh } from "@/lib/hooks/useAdminAutoRefresh";
import { MathRenderer } from "@/components/MathRenderer";
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Play,
  Copy,
  Archive,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  BarChart3,
  History,
  Lock,
  Tag,
  Calendar,
  Users,
  Send,
  X,
  Radio,
  Check,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  StopCircle,
  Pause,
} from "lucide-react";
import { Toast, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { copyExamLink, copyExamInvitation } from "@/lib/invitation";

export default function TestsManagementPage() {
  const router = useRouter();
  const [tests, setTests] = useState<Test[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [seriesList, setSeriesList] = useState<TestSeries[]>([]);

  // Toast & Accessible Confirmation Modal State
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "warning" | "primary";
    loading?: boolean;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const handleCopyCode = async (testId: string, code: string) => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedCodeId(testId);
    setToast({ message: "Access code copied to clipboard.", type: "success" });
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleCopyLink = async (test: Test) => {
    if (!test?.code) return;
    const ok = await copyExamLink(test.code);
    if (ok) {
      setCopiedLinkId(test.id);
      setToast({ message: "Examination link copied successfully.", type: "success" });
      setTimeout(() => setCopiedLinkId(null), 2000);
    }
  };

  const handleCopyInvitation = async (test: Test) => {
    if (!test?.code) return;
    const ok = await copyExamInvitation(test);
    if (ok) {
      setCopiedInviteId(test.id);
      setToast({ message: "Examination invitation copied successfully.", type: "success" });
      setTimeout(() => setCopiedInviteId(null), 2000);
    }
  };

  // Modals
  const [previewTest, setPreviewTest] = useState<Test | null>(null);
  const [previewQIndex, setPreviewQIndex] = useState<number>(0);

  const [auditTest, setAuditTest] = useState<Test | null>(null);
  const [auditLogs, setAuditLogs] = useState<TestAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Pre-publish Validation Summary Modal
  const [publishModalTest, setPublishModalTest] = useState<Test | null>(null);
  const [publishScheduleType, setPublishScheduleType] = useState<"IMMEDIATE" | "SCHEDULED">("IMMEDIATE");
  const [publishStartTime, setPublishStartTime] = useState<string>("");
  const [publishEndTime, setPublishEndTime] = useState<string>("");
  const [publishing, setPublishing] = useState<boolean>(false);

  // Edit Schedule Modal
  const [scheduleModalTest, setScheduleModalTest] = useState<Test | null>(null);
  const [editStartTime, setEditStartTime] = useState<string>("");
  const [editEndTime, setEditEndTime] = useState<string>("");
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const [subjs, series] = await Promise.all([
        api.getSubjects(),
        api.listTestSeries({ page_size: 100 }),
      ]);
      setSubjects(subjs);
      setSeriesList(series.items);
    } catch (e) {
      console.error(e);
    }
  };
  const loadTests = async (signal?: AbortSignal, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);
      const res = await api.listTests(
        {
          search: debouncedSearch.trim() || undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          subject_id: subjectFilter || undefined,
          series_id: seriesFilter || undefined,
          page,
          page_size: 20,
        },
        signal ? { signal } : undefined
      );
      setTests(res.items || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.status === 499 || e?.status === 401 || e?.message?.includes("Failed to fetch") || e?.isNetworkError) {
        return; // Stale request cancelled intentionally
      }
      if (isInitial) {
        setError(e.message || "Failed to load tests");
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadTests(controller.signal, true);
    return () => {
      controller.abort();
    };
  }, [debouncedSearch, statusFilter, subjectFilter, seriesFilter, page]);

  // Silent background auto-refresh every 6 seconds (pauses when modal or menu is open)
  useAdminAutoRefresh({
    intervalMs: 6000,
    enabled: !previewTest && !auditTest && !publishModalTest && !scheduleModalTest && !confirmModal.isOpen,
    onRefresh: () => loadTests(undefined, false),
  });

  const handleDuplicate = async (testId: string) => {
    try {
      setOpenMenuId(null);
      const duplicated = await api.duplicateTest(testId);
      loadTests();
      setToast({ message: "Test duplicated successfully", type: "success" });
      router.push(`/admin/tests/${duplicated.id}`);
    } catch (e: any) {
      setToast({ message: e.message || "Failed to duplicate test", type: "error" });
    }
  };

  const handleArchive = (testId: string) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Archive Examination",
      message: "Are you sure you want to archive this examination paper? It will be moved out of active test listings.",
      confirmLabel: "Archive",
      variant: "danger",
      onConfirm: async () => {
        try {
          await api.archiveTest(testId);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: "Examination archived successfully", type: "success" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to archive test", type: "error" });
        }
      },
    });
  };

  const handleComplete = (testId: string) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Conclude Examination",
      message: "Conclude this examination now? The test status will be marked as COMPLETED and no further student submissions will be accepted.",
      confirmLabel: "Conclude Test",
      variant: "warning",
      onConfirm: async () => {
        try {
          await api.completeTest(testId);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: "Examination concluded and marked COMPLETED", type: "success" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to complete test", type: "error" });
        }
      },
    });
  };

  const handleRestore = async (testId: string) => {
    try {
      setOpenMenuId(null);
      await api.restoreTest(testId);
      loadTests();
      setToast({ message: "Examination restored to draft", type: "success" });
    } catch (e: any) {
      setToast({ message: e.message || "Failed to restore test", type: "error" });
    }
  };

  const handleStartNow = (test: Test) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Launch Examination LIVE",
      message: `Launch examination '${test.title}' LIVE right now? Students with the access code will be able to enter immediately.`,
      confirmLabel: "Launch Live",
      variant: "primary",
      onConfirm: async () => {
        try {
          await api.updateTest(test.id, { status: "LIVE", start_time: new Date().toISOString() });
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: `Examination '${test.title}' is now LIVE!`, type: "success" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to launch examination live", type: "error" });
        }
      },
    });
  };

  const handlePause = (testId: string) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Pause Examination",
      message: "Pause this examination? New candidate entries and question answering will be frozen until resumed.",
      confirmLabel: "Pause Test",
      variant: "warning",
      onConfirm: async () => {
        try {
          await api.pauseTest(testId);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: "Examination paused", type: "warning" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to pause examination", type: "error" });
        }
      },
    });
  };

  const handleResume = (testId: string) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Resume Examination",
      message: "Resume this examination? Active candidate timers will be extended by the pause duration and answering unlocked.",
      confirmLabel: "Resume Test",
      variant: "primary",
      onConfirm: async () => {
        try {
          await api.resumeTest(testId);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: "Examination resumed", type: "success" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to resume examination", type: "error" });
        }
      },
    });
  };

  const handleCancel = (test: Test) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Cancel Examination",
      message: `Permanently cancel examination '${test.title}'? Candidates will no longer be able to write or access the test. Historical results and logs will be preserved.`,
      confirmLabel: "Cancel Exam",
      variant: "danger",
      onConfirm: async () => {
        try {
          await api.cancelTest(test.id, "Administrative cancellation");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: `Examination '${test.title}' was cancelled`, type: "warning" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to cancel examination", type: "error" });
        }
      },
    });
  };

  const handleUnschedule = (testId: string) => {
    setOpenMenuId(null);
    setConfirmModal({
      isOpen: true,
      title: "Move to Draft",
      message: "Move this scheduled examination back to DRAFT? You will be able to edit its questions and schedule settings.",
      confirmLabel: "Move to Draft",
      variant: "warning",
      onConfirm: async () => {
        try {
          await api.unscheduleTest(testId);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadTests();
          setToast({ message: "Test moved back to draft", type: "success" });
        } catch (e: any) {
          setToast({ message: e.message || "Failed to move test back to draft", type: "error" });
        }
      },
    });
  };

  const openPublishModal = (test: Test) => {
    setOpenMenuId(null);
    setPublishModalTest(test);
    if (test.start_time) {
      setPublishScheduleType("SCHEDULED");
      setPublishStartTime(test.start_time.slice(0, 16));
      setPublishEndTime(test.end_time ? test.end_time.slice(0, 16) : "");
    } else {
      setPublishScheduleType("IMMEDIATE");
      setPublishStartTime("");
      setPublishEndTime("");
    }
  };

  const executePublish = async () => {
    if (!publishModalTest) return;
    if (publishModalTest.question_count === 0) {
      alert("Cannot publish an examination with 0 questions. Please add questions first.");
      return;
    }

    try {
      setPublishing(true);
      if (publishScheduleType === "SCHEDULED") {
        if (!publishStartTime) {
          alert("Please specify a scheduled start time.");
          setPublishing(false);
          return;
        }
        await api.updateTest(publishModalTest.id, {
          start_time: new Date(publishStartTime).toISOString(),
          end_time: publishEndTime ? new Date(publishEndTime).toISOString() : null,
        });
      } else {
        await api.updateTest(publishModalTest.id, {
          start_time: null,
          end_time: null,
        });
      }

      await api.publishTest(publishModalTest.id);
      setPublishModalTest(null);
      loadTests();
    } catch (e: any) {
      alert(e.message || "Failed to publish test");
    } finally {
      setPublishing(false);
    }
  };

  const openEditSchedule = (test: Test) => {
    setOpenMenuId(null);
    setScheduleModalTest(test);
    setEditStartTime(test.start_time ? test.start_time.slice(0, 16) : "");
    setEditEndTime(test.end_time ? test.end_time.slice(0, 16) : "");
  };

  const saveSchedule = async () => {
    if (!scheduleModalTest) return;
    try {
      setSavingSchedule(true);
      await api.updateTest(scheduleModalTest.id, {
        start_time: editStartTime ? new Date(editStartTime).toISOString() : null,
        end_time: editEndTime ? new Date(editEndTime).toISOString() : null,
      });
      setScheduleModalTest(null);
      loadTests();
    } catch (e: any) {
      alert(e.message || "Failed to update schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const openAuditLogs = async (test: Test) => {
    setOpenMenuId(null);
    setAuditTest(test);
    setLoadingAudit(true);
    try {
      const logs = await api.getTestAuditLogs(test.id);
      setAuditLogs(logs);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingAudit(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "LIVE":
      case "PUBLISHED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 700,
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 6px #10b981",
              }}
            />
            <span>LIVE</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(59, 130, 246, 0.15)",
              color: "#60a5fa",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 700,
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            <Calendar size={12} />
            <span>SCHEDULED</span>
          </span>
        );
      case "DRAFT":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 600,
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <span>DRAFT</span>
          </span>
        );
      case "COMPLETED":
      case "CLOSED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(148, 163, 184, 0.15)",
              color: "#94a3b8",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 600,
              border: "1px solid rgba(148, 163, 184, 0.3)",
            }}
          >
            <CheckCircle size={12} />
            <span>COMPLETED</span>
          </span>
        );
      case "ARCHIVED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(239, 68, 68, 0.12)",
              color: "#f87171",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 600,
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <Archive size={12} />
            <span>ARCHIVED</span>
          </span>
        );
      case "PAUSED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 700,
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <Pause size={12} />
            <span>PAUSED</span>
          </span>
        );
      case "CANCELLED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              fontWeight: 700,
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <XCircle size={12} />
            <span>CANCELLED</span>
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      {/* Header with primary Create Test button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            Examination Management
          </h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Create, schedule, publish, and monitor examinations across the institute.
          </p>
        </div>

        <NextLink
          href="/admin/tests/new"
          className="btn btn-primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            fontWeight: 700,
            padding: "0.7rem 1.25rem",
            fontSize: "0.95rem",
          }}
        >
          <Plus size={18} />
          <span>Create Test</span>
        </NextLink>
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

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Status Filter Tabs */}
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {["ALL", "DRAFT", "SCHEDULED", "LIVE", "PAUSED", "COMPLETED", "CANCELLED", "ARCHIVED"].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              style={{
                background: statusFilter === st ? "#6366f1" : "var(--bg-surface-elevated)",
                color: statusFilter === st ? "#ffffff" : "var(--text-muted)",
                border: "1px solid",
                borderColor: statusFilter === st ? "#6366f1" : "var(--border-color)",
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {st === "ALL" ? "All Tests" : st}
            </button>
          ))}
        </div>

        {/* Search and Dropdowns */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", minWidth: "220px" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search tests or access code..."
              className="input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: "2.2rem", fontSize: "0.85rem", height: "36px" }}
            />
          </div>

          <select
            className="input"
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setPage(1);
            }}
            style={{ height: "36px", fontSize: "0.85rem" }}
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={seriesFilter}
            onChange={(e) => {
              setSeriesFilter(e.target.value);
              setPage(1);
            }}
            style={{ height: "36px", fontSize: "0.85rem" }}
          >
            <option value="">All Series</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tests Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3.5rem", textAlign: "center", color: "var(--text-muted)" }}>
            Loading tests...
          </div>
        ) : tests.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                    color: "var(--text-muted)",
                    background: "var(--bg-surface-elevated)",
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <th style={{ padding: "0.85rem 1rem" }}>Test Title & Access Code</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Subject & Series</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Topics</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Duration & Marks</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Status</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Schedule & Dates</th>
                  <th style={{ padding: "0.85rem 0.75rem" }}>Candidates</th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => {
                  const isLive = test.status === "LIVE" || test.status === "PUBLISHED";
                  const isDraft = test.status === "DRAFT";
                  const isScheduled = test.status === "SCHEDULED";
                  const isPaused = test.status === "PAUSED";
                  const isCompleted = test.status === "COMPLETED" || test.status === "CLOSED";
                  const isCancelled = test.status === "CANCELLED";
                  const isArchived = test.status === "ARCHIVED";

                  return (
                    <tr
                      key={test.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        background: isLive ? "rgba(16, 185, 129, 0.03)" : "transparent",
                      }}
                    >
                      {/* Title & Code */}
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <NextLink
                            href={`/admin/tests/${test.id}`}
                            style={{
                              color: "var(--text-main)",
                              fontWeight: 600,
                              fontSize: "0.95rem",
                              textDecoration: "none",
                            }}
                          >
                            {test.title}
                          </NextLink>
                          {isLive && (
                            <span
                              title="Structural modifications locked while exam is live"
                              style={{ color: "#34d399", display: "inline-flex" }}
                            >
                              <Lock size={13} />
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.25rem" }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              fontSize: "0.76rem",
                              background: "rgba(99, 102, 241, 0.15)",
                              color: "var(--primary-600)",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                            }}
                          >
                            {test.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(test.id, test.code)}
                            title="Copy candidate access code"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "0.15rem",
                              color: copiedCodeId === test.id ? "#34d399" : "var(--text-subtle)",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            {copiedCodeId === test.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* Subject & Series */}
                      <td style={{ padding: "1rem 0.75rem", color: "var(--text-muted)" }}>
                        <div style={{ fontWeight: 500, color: "var(--text-main)" }}>
                          {test.subject_name || "General"}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                          {test.test_series_name ? `Series: ${test.test_series_name}` : "Standalone"}
                        </div>
                      </td>

                      {/* Topics Covered */}
                      <td style={{ padding: "1rem 0.75rem", maxWidth: "180px" }}>
                        {test.topics_covered ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                            {test.topics_covered.split(",").slice(0, 2).map((top, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: "0.72rem",
                                  background: "var(--bg-surface-elevated)",
                                  color: "var(--text-muted)",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  maxWidth: "140px",
                                }}
                              >
                                {top.trim()}
                              </span>
                            ))}
                            {test.topics_covered.split(",").length > 2 && (
                              <span style={{ fontSize: "0.72rem", color: "var(--text-subtle)" }}>
                                +{test.topics_covered.split(",").length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-subtle)", fontSize: "0.8rem" }}>—</span>
                        )}
                      </td>

                      {/* Duration & Questions */}
                      <td style={{ padding: "1rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "var(--text-main)", fontWeight: 500 }}>
                          <Clock size={13} color="var(--text-muted)" />
                          <span>{test.duration_minutes} mins</span>
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          {test.question_count} Qs ({test.total_marks} Marks)
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "1rem 0.75rem" }}>{getStatusBadge(test.status)}</td>

                      {/* Schedule & Dates */}
                      <td style={{ padding: "1rem 0.75rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                        {isScheduled ? (
                          <div>
                            <div style={{ color: "#60a5fa", fontWeight: 600 }}>
                              Starts: {formatDateTime(test.start_time)}
                            </div>
                            {test.end_time && (
                              <div style={{ color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                                Ends: {formatDateTime(test.end_time)}
                              </div>
                            )}
                          </div>
                        ) : isLive ? (
                          <div>
                            <div style={{ color: "#34d399", fontWeight: 600 }}>Live Exam Window</div>
                            <div style={{ color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                              Published: {formatDate(test.published_at || test.created_at)}
                            </div>
                          </div>
                        ) : isPaused ? (
                          <div>
                            <div style={{ color: "#fbbf24", fontWeight: 600 }}>Exam Paused</div>
                            <div style={{ color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                              Paused: {formatDateTime(test.paused_at)}
                            </div>
                          </div>
                        ) : isCancelled ? (
                          <div>
                            <div style={{ color: "#f87171", fontWeight: 600 }}>Exam Cancelled</div>
                            <div style={{ color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                              Cancelled: {formatDateTime(test.cancelled_at)}
                            </div>
                          </div>
                        ) : isCompleted ? (
                          <div>
                            <div style={{ color: "var(--text-main)" }}>Concluded</div>
                            <div style={{ color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                              {formatDate(test.end_time || test.updated_at)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div>Created: {formatDate(test.created_at)}</div>
                            <div style={{ color: "var(--text-subtle)", marginTop: "0.15rem" }}>Draft Paper</div>
                          </div>
                        )}
                      </td>

                      {/* Candidates: Participants & Submissions */}
                      <td style={{ padding: "1rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem" }}>
                          <Users size={13} color="#c084fc" />
                          <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{test.total_participants || 0}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          <Send size={12} color="#34d399" />
                          <span>{test.total_submissions || test.attempts_count || 0} submitted</span>
                        </div>
                      </td>

                      {/* Contextual Actions strictly per state */}
                      <td style={{ padding: "1rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          {/* DRAFT STATE: Open / Edit / Preview / Publish */}
                          {isDraft && (
                            <>
                              <NextLink
                                href={`/admin/tests/${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="Open & Edit question paper"
                              >
                                <span>Edit</span>
                              </NextLink>

                              <button
                                onClick={() => {
                                  setPreviewTest(test);
                                  setPreviewQIndex(0);
                                }}
                                className="btn btn-secondary btn-sm"
                                title="Preview actual student exam window"
                              >
                                <Eye size={13} />
                              </button>

                              <button
                                onClick={() => openPublishModal(test)}
                                className="btn btn-primary btn-sm"
                                title="Publish or schedule examination"
                                style={{ background: "#10b981", borderColor: "#10b981", color: "var(--text-main)" }}
                              >
                                <span>Publish</span>
                              </button>
                            </>
                          )}

                          {/* SCHEDULED STATE: Open / Preview / Edit schedule / Logs */}
                          {isScheduled && (
                            <>
                              <NextLink
                                href={`/admin/tests/${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="Open examination details"
                              >
                                <span>Open</span>
                              </NextLink>

                              <button
                                onClick={() => {
                                  setPreviewTest(test);
                                  setPreviewQIndex(0);
                                }}
                                className="btn btn-secondary btn-sm"
                                title="Preview actual student exam window"
                              >
                                <Eye size={13} />
                              </button>

                              <button
                                onClick={() => openEditSchedule(test)}
                                className="btn btn-secondary btn-sm"
                                title="Modify scheduled start and end dates"
                              >
                                <Calendar size={13} />
                                <span style={{ marginLeft: "0.2rem" }}>Schedule</span>
                              </button>
                            </>
                          )}

                          {/* LIVE STATE: Preview / Monitor / Results / Logs */}
                          {isLive && (
                            <>
                              <NextLink
                                href={`/admin/tests/${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="Monitor test settings and live status"
                              >
                                <span>Monitor</span>
                              </NextLink>

                              <button
                                onClick={() => {
                                  setPreviewTest(test);
                                  setPreviewQIndex(0);
                                }}
                                className="btn btn-secondary btn-sm"
                                title="Preview actual student exam window"
                              >
                                <Eye size={13} />
                              </button>

                              <NextLink
                                href={`/admin/results?test_id=${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="View live student attempts and scores"
                              >
                                <BarChart3 size={13} />
                              </NextLink>
                            </>
                          )}

                          {/* PAUSED STATE: Resume / Results / Details */}
                          {isPaused && (
                            <>
                              <button
                                onClick={() => handleResume(test.id)}
                                className="btn btn-primary btn-sm"
                                style={{ background: "#10b981", borderColor: "#10b981", color: "var(--text-main)" }}
                                title="Resume paused examination"
                              >
                                <Play size={13} />
                                <span style={{ marginLeft: "0.2rem" }}>Resume</span>
                              </button>

                              <NextLink
                                href={`/admin/results?test_id=${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="View student attempts"
                              >
                                <BarChart3 size={13} />
                              </NextLink>

                              <NextLink
                                href={`/admin/tests/${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="Monitor test settings and live status"
                              >
                                <span>Monitor</span>
                              </NextLink>
                            </>
                          )}

                          {/* COMPLETED STATE: Preview / Results / Logs / Archive */}
                          {isCompleted && (
                            <>
                              <NextLink
                                href={`/admin/results?test_id=${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="View complete rank list and score distribution"
                                style={{ color: "#38bdf8" }}
                              >
                                <BarChart3 size={13} />
                                <span style={{ marginLeft: "0.25rem" }}>Results</span>
                              </NextLink>

                              <button
                                onClick={() => {
                                  setPreviewTest(test);
                                  setPreviewQIndex(0);
                                }}
                                className="btn btn-secondary btn-sm"
                                title="Preview student exam paper"
                              >
                                <Eye size={13} />
                              </button>

                              <NextLink
                                href={`/admin/tests/${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="View test paper details"
                              >
                                <span>Details</span>
                              </NextLink>
                            </>
                          )}

                          {/* CANCELLED STATE: Results / Details */}
                          {isCancelled && (
                            <>
                              <NextLink
                                href={`/admin/results?test_id=${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="View preserved student submissions"
                              >
                                <BarChart3 size={13} />
                                <span style={{ marginLeft: "0.25rem" }}>Results</span>
                              </NextLink>

                              <NextLink
                                href={`/admin/tests/${test.id}`}
                                className="btn btn-secondary btn-sm"
                                title="View cancelled test details"
                              >
                                <span>Details</span>
                              </NextLink>
                            </>
                          )}

                          {/* ARCHIVED STATE: View / Logs / Restore */}
                          {isArchived && (
                            <>
                              <button
                                onClick={() => handleRestore(test.id)}
                                className="btn btn-secondary btn-sm"
                                title="Restore examination paper"
                                style={{ color: "#34d399" }}
                              >
                                <RotateCcw size={13} />
                                <span style={{ marginLeft: "0.25rem" }}>Restore</span>
                              </button>
                            </>
                          )}

                          {/* Contextual Overflow Dropdown */}
                          <div>
                            <button
                              ref={(el) => {
                                if (openMenuId === test.id) {
                                  activeTriggerRef.current = el;
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openMenuId === test.id) {
                                  setOpenMenuId(null);
                                  activeTriggerRef.current = null;
                                } else {
                                  activeTriggerRef.current = e.currentTarget;
                                  setOpenMenuId(test.id);
                                }
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "0.35rem 0.45rem" }}
                              aria-label={`Actions for ${test.title}`}
                              aria-expanded={openMenuId === test.id}
                              aria-haspopup="true"
                            >
                              <MoreVertical size={14} />
                            </button>

                            <DropdownMenu
                              isOpen={openMenuId === test.id}
                              onClose={() => setOpenMenuId(null)}
                              triggerRef={activeTriggerRef}
                              minWidth={195}
                            >
                              {/* Common Sharing Options */}
                              <DropdownMenuItem
                                icon={<ExternalLink size={13} />}
                                onClick={() => {
                                  handleCopyLink(test);
                                  setOpenMenuId(null);
                                }}
                              >
                                Copy Exam Link
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                icon={<Send size={13} />}
                                onClick={() => {
                                  handleCopyInvitation(test);
                                  setOpenMenuId(null);
                                }}
                              >
                                Copy Invitation
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {/* DRAFT Options */}
                              {isDraft && (
                                <>
                                  <DropdownMenuItem
                                    icon={<Copy size={13} />}
                                    onClick={() => {
                                      handleDuplicate(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Duplicate
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<History size={13} />}
                                    onClick={() => {
                                      openAuditLogs(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Audit Logs
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<RotateCcw size={13} />}
                                    variant="warning"
                                    onClick={() => {
                                      handleUnschedule(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Move to Draft
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<XCircle size={13} />}
                                    variant="danger"
                                    onClick={() => {
                                      handleCancel(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Cancel Examination
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* LIVE Options */}
                              {isLive && (
                                <>
                                  <DropdownMenuItem
                                    icon={<Pause size={13} />}
                                    variant="warning"
                                    onClick={() => {
                                      handlePause(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Pause Exam
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<StopCircle size={13} />}
                                    variant="danger"
                                    onClick={() => {
                                      handleComplete(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    End Exam (Conclude)
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<XCircle size={13} />}
                                    variant="danger"
                                    onClick={() => {
                                      handleCancel(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Cancel Examination
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<History size={13} />}
                                    onClick={() => {
                                      openAuditLogs(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Audit Logs
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* PAUSED Options */}
                              {isPaused && (
                                <>
                                  <DropdownMenuItem
                                    icon={<Play size={13} />}
                                    variant="success"
                                    onClick={() => {
                                      handleResume(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Resume Exam
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<StopCircle size={13} />}
                                    variant="danger"
                                    onClick={() => {
                                      handleComplete(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    End Exam (Conclude)
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<XCircle size={13} />}
                                    variant="danger"
                                    onClick={() => {
                                      handleCancel(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Cancel Examination
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<History size={13} />}
                                    onClick={() => {
                                      openAuditLogs(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Audit Logs
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* CANCELLED Options */}
                              {isCancelled && (
                                <>
                                  <DropdownMenuItem
                                    icon={<Copy size={13} />}
                                    onClick={() => {
                                      handleDuplicate(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Duplicate Paper
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<History size={13} />}
                                    onClick={() => {
                                      openAuditLogs(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Audit Logs
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* COMPLETED Options */}
                              {isCompleted && (
                                <>
                                  <DropdownMenuItem
                                    icon={<Copy size={13} />}
                                    onClick={() => {
                                      handleDuplicate(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Duplicate Paper
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<History size={13} />}
                                    onClick={() => {
                                      openAuditLogs(test);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Audit Logs
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    icon={<Archive size={13} />}
                                    variant="danger"
                                    onClick={() => {
                                      handleArchive(test.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Archive
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* ARCHIVED Options */}
                              {isArchived && (
                                <DropdownMenuItem
                                  icon={<History size={13} />}
                                  onClick={() => {
                                    openAuditLogs(test);
                                    setOpenMenuId(null);
                                  }}
                                >
                                  Audit Logs
                                </DropdownMenuItem>
                              )}
                            </DropdownMenu>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "4rem 1rem", textAlign: "center" }}>
            <FileText size={42} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: "0.75rem" }} />
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem 0", color: "var(--text-main)" }}>
              No Examination Papers Found
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", maxWidth: "380px", margin: "0 auto 1.5rem auto" }}>
              Create a new examination paper to compose questions and schedule tests.
            </p>
            <NextLink href="/admin/tests/new" className="btn btn-primary btn-sm">
              <Plus size={14} />
              <span>Create New Test</span>
            </NextLink>
          </div>
        )}
      </div>

      {/* PRE-PUBLISH VALIDATION & CONFIRMATION SUMMARY MODAL */}
      {publishModalTest && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "560px",
              width: "100%",
              padding: "2rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShieldCheck size={20} color="#10b981" />
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                  Confirm & Publish Examination
                </h2>
              </div>
              <button
                onClick={() => setPublishModalTest(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: "0 0 1.25rem 0" }}>
              Review the validation summary below before publishing. Once published, the unique student access code will be generated.
            </p>

            {/* Validation Checklist / Summary */}
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.25rem",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>Examination:</span>
                <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "0.15rem" }}>
                  {publishModalTest.title}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Subject:</span>
                <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "0.15rem" }}>
                  {publishModalTest.subject_name || "General"}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Total Questions:</span>
                <div
                  style={{
                    fontWeight: 700,
                    color: publishModalTest.question_count > 0 ? "#34d399" : "#f87171",
                    marginTop: "0.15rem",
                  }}
                >
                  {publishModalTest.question_count} Questions
                  {publishModalTest.question_count === 0 && " (Required >= 1)"}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Total Marks:</span>
                <div style={{ fontWeight: 700, color: "var(--text-main)", marginTop: "0.15rem" }}>
                  {publishModalTest.total_marks} Marks (+{publishModalTest.positive_marks} / -{publishModalTest.negative_marks})
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Duration:</span>
                <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "0.15rem" }}>
                  {publishModalTest.duration_minutes} minutes
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Rules:</span>
                <div style={{ fontSize: "0.78rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                  Resume: {publishModalTest.allow_resume ? "Allowed" : "Blocked"} • Order: {publishModalTest.question_order}
                </div>
              </div>
            </div>

            {/* Generated Access Code Banner */}
            <div
              style={{
                background: "rgba(99, 102, 241, 0.12)",
                border: "1px dashed rgba(99, 102, 241, 0.4)",
                borderRadius: "8px",
                padding: "0.85rem 1rem",
                marginBottom: "1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "0.76rem", color: "var(--primary-600)", fontWeight: 600, textTransform: "uppercase" }}>
                  Student Access Code
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "1.15rem", fontWeight: 700, color: "var(--text-main)" }}>
                  {publishModalTest.code}
                </div>
              </div>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Activated on publish</span>
            </div>

            {/* Scheduling Options */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-main)", display: "block", marginBottom: "0.5rem" }}>
                Examination Schedule Option:
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.6rem",
                    background: publishScheduleType === "IMMEDIATE" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${publishScheduleType === "IMMEDIATE" ? "#6366f1" : "var(--border-color)"}`,
                    padding: "0.75rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={publishScheduleType === "IMMEDIATE"}
                    onChange={() => setPublishScheduleType("IMMEDIATE")}
                    style={{ marginTop: "0.2rem" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-main)" }}>
                      Immediate / Open Exam (Recommended)
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      Becomes LIVE immediately. Students can start at any time using the access code.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.6rem",
                    background: publishScheduleType === "SCHEDULED" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${publishScheduleType === "SCHEDULED" ? "#6366f1" : "var(--border-color)"}`,
                    padding: "0.75rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={publishScheduleType === "SCHEDULED"}
                    onChange={() => setPublishScheduleType("SCHEDULED")}
                    style={{ marginTop: "0.2rem" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-main)" }}>
                      Fixed Time Window (Scheduled)
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      Examination opens only at designated start time and closes at end time.
                    </div>

                    {publishScheduleType === "SCHEDULED" && (
                      <div style={{ marginTop: "0.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <div>
                          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                            Start Time *
                          </label>
                          <input
                            type="datetime-local"
                            className="input"
                            value={publishStartTime}
                            onChange={(e) => setPublishStartTime(e.target.value)}
                            style={{ fontSize: "0.8rem", height: "34px" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                            End Time (Optional)
                          </label>
                          <input
                            type="datetime-local"
                            className="input"
                            value={publishEndTime}
                            onChange={(e) => setPublishEndTime(e.target.value)}
                            style={{ fontSize: "0.8rem", height: "34px" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                onClick={() => setPublishModalTest(null)}
                className="btn btn-secondary btn-sm"
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                onClick={executePublish}
                disabled={publishing || publishModalTest.question_count === 0}
                className="btn btn-primary btn-sm"
                style={{
                  background: "#10b981",
                  borderColor: "#10b981",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <Check size={14} />
                <span>{publishing ? "Publishing..." : "Confirm & Publish"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SCHEDULE MODAL */}
      {scheduleModalTest && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "480px",
              width: "100%",
              padding: "1.75rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Calendar size={18} color="#60a5fa" />
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                  Edit Examination Schedule
                </h3>
              </div>
              <button
                onClick={() => setScheduleModalTest(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 1.25rem 0" }}>
              Configure start and expiration window for <strong>{scheduleModalTest.title}</strong>.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-main)", display: "block", marginBottom: "0.35rem" }}>
                  Start Date & Time (Opens for candidates)
                </label>
                <input
                  type="datetime-local"
                  className="input"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-main)", display: "block", marginBottom: "0.35rem" }}>
                  End Date & Time (Optional conclusion window)
                </label>
                <input
                  type="datetime-local"
                  className="input"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                onClick={() => setScheduleModalTest(null)}
                className="btn btn-secondary btn-sm"
                disabled={savingSchedule}
              >
                Cancel
              </button>
              <button
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="btn btn-primary btn-sm"
              >
                {savingSchedule ? "Saving..." : "Save Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT EXAM PREVIEW MODAL */}
      {previewTest && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "760px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              padding: "1.75rem",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <span style={{ fontSize: "0.78rem", color: "#60a5fa", fontWeight: 600 }}>CANDIDATE EXAM PREVIEW</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0.2rem 0 0 0", color: "var(--text-main)" }}>
                  {previewTest.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewTest(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {previewTest.questions && previewTest.questions.length > 0 ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                  <span>Question {previewQIndex + 1} of {previewTest.questions.length}</span>
                  <span>+{previewTest.questions[previewQIndex]?.marks || previewTest.positive_marks} / -{previewTest.questions[previewQIndex]?.negative_marks || previewTest.negative_marks} Marks</span>
                </div>

                <div style={{ background: "rgba(255,255,255,0.03)", padding: "1.2rem", borderRadius: "8px", border: "1px solid var(--border-color)", marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-main)", lineHeight: 1.6 }}>
                    <MathRenderer text={previewTest.questions[previewQIndex]?.question?.content} />
                  </div>

                  {previewTest.questions[previewQIndex]?.question?.options && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
                      {previewTest.questions[previewQIndex]?.question?.options?.map((opt, oIdx) => (
                        <div
                          key={opt.id || oIdx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.85rem",
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            fontSize: "0.9rem",
                            color: "var(--text-main)",
                          }}
                        >
                          <span style={{ fontWeight: 700, color: "#60a5fa", width: "18px", flexShrink: 0 }}>
                            {String.fromCharCode(65 + oIdx)}.
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <MathRenderer inline text={opt.content} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagination Controls in Preview */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    onClick={() => setPreviewQIndex(Math.max(0, previewQIndex - 1))}
                    disabled={previewQIndex === 0}
                    className="btn btn-secondary btn-sm"
                  >
                    Previous Question
                  </button>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", maxWidth: "360px", justifyContent: "center" }}>
                    {previewTest.questions.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewQIndex(idx)}
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "4px",
                          background: previewQIndex === idx ? "#6366f1" : "rgba(255,255,255,0.05)",
                          color: previewQIndex === idx ? "#ffffff" : "var(--text-muted)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPreviewQIndex(Math.min(previewTest.questions.length - 1, previewQIndex + 1))}
                    disabled={previewQIndex === previewTest.questions.length - 1}
                    className="btn btn-secondary btn-sm"
                  >
                    Next Question
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                No questions have been added to this examination paper yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUDIT LOGS MODAL */}
      {auditTest && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "680px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              padding: "1.75rem",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <History size={18} color="var(--primary-600)" />
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                  Examination Activity & Audit Trail
                </h3>
              </div>
              <button
                onClick={() => setAuditTest(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 1.25rem 0" }}>
              Immutable audit log of administrative actions on <strong>{auditTest.title}</strong> ({auditTest.code}).
            </p>

            {loadingAudit ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                Loading activity history...
              </div>
            ) : auditLogs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "0.85rem 1rem",
                      background: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "0.76rem",
                          fontFamily: "monospace",
                          color:
                            log.action === "ADMIN_CORRECTION"
                              ? "#fbbf24"
                              : log.action.includes("PUBLISHED") || log.action.includes("SCHEDULED")
                              ? "var(--success)"
                              : "var(--primary-600)",
                          background: "var(--bg-surface)",
                          padding: "0.15rem 0.4rem",
                          borderRadius: "4px",
                        }}
                      >
                        {log.action}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-main)", marginTop: "0.2rem" }}>{log.details}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.25rem" }}>
                      By: {log.admin_name}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                No audit entries recorded for this examination yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accessible Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        variant={confirmModal.variant}
        loading={confirmModal.loading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Accessible Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
