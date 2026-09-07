"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Shield,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Maximize2,
  ExternalLink,
  Layers,
  WifiOff,
  Wifi,
  RotateCw,
  RefreshCw,
  Filter,
  Copy,
  Check,
  Info,
  ArrowUpDown,
} from "lucide-react";
import {
  api,
  AttemptIntegritySummary,
  AttemptIntegrityEventItem,
} from "@/lib/api";

interface IntegrityTimelineModalProps {
  isOpen: boolean;
  attemptId: string | null;
  candidateName?: string;
  rollNumber?: string;
  onClose: () => void;
}

type EventFilterCategory =
  | "ALL"
  | "TABS"
  | "FULLSCREEN"
  | "CONCURRENT"
  | "INACTIVITY"
  | "NETWORK"
  | "REFRESH";

export function IntegrityTimelineModal({
  isOpen,
  attemptId,
  candidateName,
  rollNumber,
  onClose,
}: IntegrityTimelineModalProps) {
  const [summary, setSummary] = useState<AttemptIntegritySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<EventFilterCategory>("ALL");
  const [copied, setCopied] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "OLDEST">("NEWEST");

  useEffect(() => {
    if (!isOpen || !attemptId) {
      setSummary(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchIntegrity = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAttemptIntegrity(attemptId);
        if (isMounted) {
          setSummary(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load attempt integrity log.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchIntegrity();

    return () => {
      isMounted = false;
    };
  }, [isOpen, attemptId]);

  const filteredEvents = useMemo(() => {
    if (!summary?.events) return [];
    let list = [...summary.events];

    if (selectedFilter !== "ALL") {
      list = list.filter((ev) => {
        const t = ev.event_type.toUpperCase();
        if (selectedFilter === "TABS") return t.includes("TAB_SWITCHED") || t.includes("WINDOW_BLUR") || t.includes("VISIBILITY");
        if (selectedFilter === "FULLSCREEN") return t.includes("FULLSCREEN");
        if (selectedFilter === "CONCURRENT") return t.includes("MULTIPLE_TAB");
        if (selectedFilter === "INACTIVITY") return t.includes("INACTIVITY");
        if (selectedFilter === "NETWORK") return t.includes("NETWORK");
        if (selectedFilter === "REFRESH") return t.includes("REFRESH");
        return true;
      });
    }

    list.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === "NEWEST" ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [summary, selectedFilter, sortOrder]);

  const inactivityCount = useMemo(() => {
    if (!summary) return 0;
    if (summary.inactivity_warnings !== undefined && summary.inactivity_warnings !== null) {
      return summary.inactivity_warnings;
    }
    return summary.events?.filter((e) => e.event_type.toUpperCase().includes("INACTIVITY")).length || 0;
  }, [summary]);

  const formatDuration = (sec: number | null | undefined) => {
    if (sec === null || sec === undefined || sec <= 0) return null;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const m = Math.floor(sec / 60);
    const remSec = Math.round(sec % 60);
    return `${m}m ${remSec}s`;
  };

  const formatEventTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getEventMeta = (ev: AttemptIntegrityEventItem) => {
    const t = ev.event_type.toUpperCase();

    if (t.includes("TAB_SWITCHED") || t.includes("WINDOW_BLUR") || t.includes("VISIBILITY")) {
      return {
        label: "Tab / Window Unfocused",
        icon: ExternalLink,
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.12)",
        border: "rgba(245, 158, 11, 0.3)",
      };
    }
    if (t.includes("FULLSCREEN")) {
      return {
        label: "Exited Fullscreen Mode",
        icon: Maximize2,
        color: "#a855f7",
        bg: "rgba(168, 85, 247, 0.12)",
        border: "rgba(168, 85, 247, 0.3)",
      };
    }
    if (t.includes("MULTIPLE_TAB")) {
      return {
        label: "Concurrent Tab Opened",
        icon: Layers,
        color: "#f43f5e",
        bg: "rgba(244, 63, 94, 0.12)",
        border: "rgba(244, 63, 94, 0.3)",
      };
    }
    if (t.includes("INACTIVITY")) {
      return {
        label: t.includes("WARNING") ? "Inactivity Prompt" : "Inactivity Window",
        icon: Clock,
        color: "#38bdf8",
        bg: "rgba(56, 189, 248, 0.12)",
        border: "rgba(56, 189, 248, 0.3)",
      };
    }
    if (t.includes("NETWORK_DISCONNECTED")) {
      return {
        label: "Network Offline",
        icon: WifiOff,
        color: "#fb923c",
        bg: "rgba(251, 146, 60, 0.12)",
        border: "rgba(251, 146, 60, 0.3)",
      };
    }
    if (t.includes("NETWORK_RECONNECTED")) {
      return {
        label: "Network Restored",
        icon: Wifi,
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.12)",
        border: "rgba(16, 185, 129, 0.3)",
      };
    }
    if (t.includes("REFRESH")) {
      return {
        label: "Page Reloaded",
        icon: RotateCw,
        color: "#818cf8",
        bg: "rgba(129, 140, 248, 0.12)",
        border: "rgba(129, 140, 248, 0.3)",
      };
    }

    return {
      label: ev.event_type.replace(/_/g, " "),
      icon: Shield,
      color: "var(--text-muted)",
      bg: "rgba(255, 255, 255, 0.05)",
      border: "var(--border-color)",
    };
  };

  const handleCopyJSON = () => {
    if (!summary) return;
    navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(8px)",
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "16px",
          border: "1px solid var(--border-color)",
          boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          width: "100%",
          maxWidth: "880px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "modalFadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-surface-elevated)",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)",
                border: "1px solid rgba(124, 58, 237, 0.3)",
                color: "var(--primary-400)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                  Examination Session Integrity Audit
                </h2>
                {summary?.review_recommended ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "9999px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      color: "#fbbf24",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                    }}
                  >
                    <AlertTriangle size={12} />
                    Review Recommended
                  </span>
                ) : summary ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "9999px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      backgroundColor: "rgba(16, 185, 129, 0.15)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    <CheckCircle2 size={12} />
                    Standard Activity
                  </span>
                ) : null}
              </div>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Candidate: <strong style={{ color: "var(--text-main)" }}>{candidateName || "Student"}</strong>
                {rollNumber ? ` • Roll: ${rollNumber}` : ""}
                {attemptId ? ` • ID: ${attemptId.substring(0, 8)}...` : ""}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={handleCopyJSON}
              disabled={!summary}
              title="Copy event payload as JSON"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.45rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                cursor: summary ? "pointer" : "not-allowed",
                opacity: summary ? 1 : 0.5,
                transition: "all 0.15s ease",
              }}
            >
              {copied ? <Check size={14} style={{ color: "#34d399" }} /> : <Copy size={14} />}
              <span>{copied ? "Copied" : "JSON"}</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                padding: "0.4rem",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s ease, color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-surface-hover)";
                e.currentTarget.style.color = "var(--text-main)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {loading ? (
            <div style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <RefreshCw size={28} className="animate-spin" style={{ color: "var(--primary-400)" }} />
              <p style={{ fontSize: "0.9rem", fontWeight: 500, margin: 0 }}>Retrieving integrity event logs from server...</p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: "1rem 1.25rem",
                backgroundColor: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                borderRadius: "12px",
                color: "var(--danger)",
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>Unable to load integrity log</p>
                <p style={{ fontSize: "0.8rem", margin: "0.2rem 0 0 0", opacity: 0.9 }}>{error}</p>
              </div>
            </div>
          ) : summary ? (
            <>
              {/* Review Recommendation Banner */}
              {summary.review_recommended ? (
                <div
                  style={{
                    padding: "1.1rem 1.25rem",
                    backgroundColor: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.85rem",
                  }}
                >
                  <ShieldAlert size={22} style={{ color: "#fbbf24", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fbbf24", margin: 0 }}>
                      Teacher Review Recommended
                    </h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0 }}>
                      The monitoring system detected environment variations exceeding standard baseline thresholds:
                    </p>
                    <ul style={{ margin: "0.3rem 0 0 0", paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-main)", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                      {summary.review_reasons.map((reason, idx) => (
                        <li key={idx} style={{ fontWeight: 500 }}>
                          {reason}
                        </li>
                      ))}
                    </ul>
                    <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "0.35rem 0 0 0", fontStyle: "italic" }}>
                      Notice: Telemetry records objective browser focus &amp; tab status. It is provided for instructor context and is not an automated penalty.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "0.85rem 1.1rem",
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    color: "var(--text-secondary)",
                    fontSize: "0.82rem",
                  }}
                >
                  <CheckCircle2 size={18} style={{ color: "#34d399", flexShrink: 0 }} />
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#34d399" }}>Standard Activity Pattern:</strong> No excessive tab switching, concurrent tabs, or unusual environment interruptions were logged.
                  </p>
                </div>
              )}

              {/* Metric Overview Tiles Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))",
                  gap: "0.65rem",
                }}
              >
                {/* 1. Total Events */}
                <div
                  style={{
                    padding: "0.85rem 0.6rem",
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600, margin: 0 }}>
                    Total Events
                  </p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-main)", margin: "0.3rem 0 0 0" }}>
                    {summary.total_events}
                  </p>
                </div>

                {/* 2. Tab Switches */}
                <div
                  style={{
                    padding: "0.85rem 0.6rem",
                    backgroundColor: summary.tab_switches > 2 ? "rgba(245, 158, 11, 0.1)" : "var(--bg-surface-elevated)",
                    border: summary.tab_switches > 2 ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid var(--border-color)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: summary.tab_switches > 2 ? "#fbbf24" : "var(--text-muted)", fontWeight: 600, margin: 0 }}>
                    Tab Switches
                  </p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color: summary.tab_switches > 2 ? "#fbbf24" : "var(--text-main)", margin: "0.3rem 0 0 0" }}>
                    {summary.tab_switches}
                  </p>
                </div>

                {/* 3. Fullscreen Exits */}
                <div
                  style={{
                    padding: "0.85rem 0.6rem",
                    backgroundColor: summary.fullscreen_exits > 0 ? "rgba(168, 85, 247, 0.1)" : "var(--bg-surface-elevated)",
                    border: summary.fullscreen_exits > 0 ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid var(--border-color)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: summary.fullscreen_exits > 0 ? "#c084fc" : "var(--text-muted)", fontWeight: 600, margin: 0 }}>
                    Fullscreen Exits
                  </p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color: summary.fullscreen_exits > 0 ? "#c084fc" : "var(--text-main)", margin: "0.3rem 0 0 0" }}>
                    {summary.fullscreen_exits}
                  </p>
                </div>

                {/* 4. Multi-Tab Detections */}
                <div
                  style={{
                    padding: "0.85rem 0.6rem",
                    backgroundColor: summary.multiple_tab_detections > 0 ? "rgba(244, 63, 94, 0.1)" : "var(--bg-surface-elevated)",
                    border: summary.multiple_tab_detections > 0 ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid var(--border-color)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: summary.multiple_tab_detections > 0 ? "#fb7185" : "var(--text-muted)", fontWeight: 600, margin: 0 }}>
                    Multi Tabs
                  </p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color: summary.multiple_tab_detections > 0 ? "#fb7185" : "var(--text-main)", margin: "0.3rem 0 0 0" }}>
                    {summary.multiple_tab_detections}
                  </p>
                </div>

                {/* 5. Inactive / Idle Time */}
                <div
                  style={{
                    padding: "0.85rem 0.6rem",
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600, margin: 0 }}>
                    Idle Time
                  </p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-main)", margin: "0.3rem 0 0 0" }}>
                    {summary.total_inactive_seconds > 0 ? formatDuration(summary.total_inactive_seconds) : "0s"}
                  </p>
                </div>

                {/* 6. Refreshes */}
                <div
                  style={{
                    padding: "0.85rem 0.6rem",
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600, margin: 0 }}>
                    Refreshes
                  </p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-main)", margin: "0.3rem 0 0 0" }}>
                    {summary.refresh_count}
                  </p>
                </div>
              </div>

              {/* Filter Pills Bar & Sorting */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  paddingTop: "0.5rem",
                  borderTop: "1px solid var(--border-color)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      marginRight: "0.2rem",
                    }}
                  >
                    <Filter size={13} />
                    Filter:
                  </span>
                  {[
                    { id: "ALL", label: `All (${summary.events.length})` },
                    { id: "TABS", label: `Tab Switch (${summary.tab_switches})` },
                    { id: "FULLSCREEN", label: `Fullscreen (${summary.fullscreen_exits})` },
                    { id: "CONCURRENT", label: `Multi-Tab (${summary.multiple_tab_detections})` },
                    { id: "INACTIVITY", label: `Inactivity (${inactivityCount})` },
                    { id: "NETWORK", label: `Network (${summary.network_interruptions})` },
                    { id: "REFRESH", label: `Refreshes (${summary.refresh_count})` },
                  ].map((f) => {
                    const isActive = selectedFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFilter(f.id as EventFilterCategory)}
                        style={{
                          padding: "0.3rem 0.65rem",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          borderRadius: "8px",
                          border: isActive ? "1px solid var(--primary-500)" : "1px solid var(--border-color)",
                          backgroundColor: isActive ? "var(--primary-500)" : "var(--bg-surface-elevated)",
                          color: isActive ? "#ffffff" : "var(--text-secondary)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.76rem", color: "var(--text-muted)" }}>
                  <span>Sort:</span>
                  <button
                    onClick={() => setSortOrder((o) => (o === "NEWEST" ? "OLDEST" : "NEWEST"))}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--primary-400)",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.2rem",
                    }}
                  >
                    <ArrowUpDown size={12} />
                    <span>{sortOrder === "NEWEST" ? "Newest First" : "Oldest First"}</span>
                  </button>
                </div>
              </div>

              {/* Events Timeline List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {filteredEvents.length === 0 ? (
                  <div
                    style={{
                      padding: "2.5rem 1rem",
                      textAlign: "center",
                      color: "var(--text-subtle)",
                      fontSize: "0.85rem",
                      border: "1px dashed var(--border-color)",
                      borderRadius: "12px",
                      backgroundColor: "rgba(255, 255, 255, 0.01)",
                    }}
                  >
                    No integrity events found matching the selected filter.
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "12px",
                      overflow: "hidden",
                      backgroundColor: "var(--bg-surface-elevated)",
                    }}
                  >
                    {filteredEvents.map((ev, idx) => {
                      const meta = getEventMeta(ev);
                      const Icon = meta.icon;
                      const durationStr = formatDuration(ev.duration_seconds);

                      let parsedMeta: Record<string, any> | null = null;
                      if (ev.metadata_json) {
                        try {
                          parsedMeta = JSON.parse(ev.metadata_json);
                        } catch {
                          parsedMeta = null;
                        }
                      }

                      return (
                        <div
                          key={ev.id || idx}
                          style={{
                            padding: "0.85rem 1.1rem",
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: "1rem",
                            borderBottom: idx === filteredEvents.length - 1 ? "none" : "1px solid var(--border-color)",
                            transition: "background-color 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-surface-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                backgroundColor: meta.bg,
                                border: `1px solid ${meta.border}`,
                                color: meta.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                marginTop: "2px",
                              }}
                            >
                              <Icon size={16} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                                  {meta.label}
                                </p>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    fontFamily: "monospace",
                                    color: "var(--text-muted)",
                                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                                    padding: "0.1rem 0.35rem",
                                    borderRadius: "4px",
                                    border: "1px solid var(--border-subtle)",
                                  }}
                                >
                                  {ev.event_type}
                                </span>
                              </div>
                              {parsedMeta && Object.keys(parsedMeta).length > 0 && (
                                <p
                                  style={{
                                    fontSize: "0.75rem",
                                    fontFamily: "monospace",
                                    color: "var(--text-muted)",
                                    backgroundColor: "rgba(0, 0, 0, 0.25)",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    margin: "0.25rem 0 0 0",
                                    wordBreak: "break-all",
                                  }}
                                >
                                  {JSON.stringify(parsedMeta)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
                              {formatEventTime(ev.timestamp)}
                            </p>
                            {durationStr && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 600,
                                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                                  color: "var(--text-muted)",
                                  border: "1px solid var(--border-color)",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                }}
                              >
                                Duration: {durationStr}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-surface-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              margin: 0,
            }}
          >
            <Info size={14} style={{ color: "var(--text-subtle)", flexShrink: 0 }} />
            Append-only server audit log. Candidate answers and exam state are strictly preserved.
          </p>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: 600, padding: "0.45rem 1.25rem" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
