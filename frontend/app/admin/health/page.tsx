"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  api,
  SystemHealthResponse,
  DatabaseHealthResponse,
  SubsystemStatus,
} from "@/lib/api";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Server,
  Database,
  ShieldCheck,
  HardDrive,
  Cpu,
  Clock,
  Zap,
  Radio,
  FileCheck,
  Lock,
  Eye,
  Sliders,
  Check,
} from "lucide-react";

export default function SystemHealthPage() {
  const [healthData, setHealthData] = useState<SystemHealthResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<DatabaseHealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [probeLatency, setProbeLatency] = useState<number | null>(null);
  const [probing, setProbing] = useState<boolean>(false);

  const fetchHealth = useCallback(async (isManual: boolean = false) => {
    if (isManual) setRefreshing(true);
    const startTime = performance.now();
    try {
      setError(null);
      const [health, db] = await Promise.all([
        api.getSystemHealth().catch((e: any) => (e?.data as SystemHealthResponse) || null),
        api.getDatabaseHealth().catch((e: any) => (e?.data as DatabaseHealthResponse) || null),
      ]);
      const roundtripMs = Math.round(performance.now() - startTime);
      setProbeLatency(roundtripMs);
      if (health) {
        setHealthData(health);
      } else {
        setError("Unable to retrieve system health. The application server or network may be unreachable.");
      }
      if (db) setDbHealth(db);
      setLastCheckTime(new Date());
    } catch (err: any) {
      console.error("Health check request failed:", err);
      setError("Unable to retrieve system health. The application server or network may be unreachable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const runDedicatedDbProbe = async () => {
    setProbing(true);
    try {
      const res = await api.getDatabaseHealth();
      setDbHealth(res);
    } catch (err) {
      console.error("Database diagnostic probe failed:", err);
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    fetchHealth(false);
  }, [fetchHealth]);

  // Periodic polling every 30 seconds only when tab is actively visible
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return; // Skip polling if tab is in the background
      }
      fetchHealth(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const getStatusIcon = (status?: string, size = 18) => {
    switch (status) {
      case "OPERATIONAL":
        return <CheckCircle2 size={size} style={{ color: "var(--success)" }} />;
      case "DEGRADED":
        return <AlertTriangle size={size} style={{ color: "var(--warning)" }} />;
      case "OFFLINE":
        return <XCircle size={size} style={{ color: "var(--danger)" }} />;
      default:
        return <HelpCircle size={size} style={{ color: "var(--text-subtle)" }} />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "OPERATIONAL":
      case "ok":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.25rem 0.65rem",
              borderRadius: "9999px",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10b981" }} />
            🟢 Operational
          </span>
        );
      case "DEGRADED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.25rem 0.65rem",
              borderRadius: "9999px",
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#f59e0b" }} />
            🟡 Degraded
          </span>
        );
      case "OFFLINE":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.25rem 0.65rem",
              borderRadius: "9999px",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#ef4444" }} />
            🔴 Offline
          </span>
        );
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.25rem 0.65rem",
              borderRadius: "9999px",
              background: "rgba(148, 163, 184, 0.15)",
              color: "#94a3b8",
              border: "1px solid rgba(148, 163, 184, 0.3)",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#94a3b8" }} />
            ⚪ Unknown
          </span>
        );
    }
  };

  const subsystemsList: {
    key: keyof SystemHealthResponse["subsystems"];
    title: string;
    description: string;
    icon: any;
  }[] = [
    {
      key: "application_server",
      title: "Application Server",
      description: "FastAPI Core Web Engine & ASGI Runtime",
      icon: Server,
    },
    {
      key: "database",
      title: "Database Engine",
      description: "PostgreSQL Relational Storage & Connection Pool",
      icon: Database,
    },
    {
      key: "api",
      title: "API Gateway",
      description: "RESTful Endpoints & Middleware Subsystem",
      icon: Cpu,
    },
    {
      key: "frontend",
      title: "Frontend Application",
      description: "Next.js Candidate & Administration Interface",
      icon: Sliders,
    },
    {
      key: "authentication",
      title: "Authentication Service",
      description: "Session Verification & Cryptographic Token Auth",
      icon: Lock,
    },
    {
      key: "exam_service",
      title: "Exam Service",
      description: "Authoritative Test Delivery & State Management",
      icon: Radio,
    },
    {
      key: "autosave",
      title: "Real-Time Autosave",
      description: "Candidate Answer Ingestion & Sync Verification",
      icon: Zap,
    },
    {
      key: "submission_and_evaluation",
      title: "Submission & Evaluation",
      description: "Automatic Grading Engine & Scorecard Finalization",
      icon: FileCheck,
    },
    {
      key: "integrity_monitoring",
      title: "Integrity Monitoring",
      description: "Proctoring Telemetry, Tab-Switch & Blur Tracking",
      icon: Eye,
    },
    {
      key: "file_media_storage",
      title: "File / Media Storage",
      description: "Local Media Asset & Image Storage Subsystem",
      icon: HardDrive,
    },
  ];

  const formatUptime = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return "N/A";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.75rem 1.5rem" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          paddingBottom: "1.25rem",
          borderBottom: "1px solid var(--border-color)",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
              System Health
            </h1>
            {healthData && getStatusBadge(healthData.status)}
          </div>
          <p style={{ margin: "0.35rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Real-time connection monitoring and subsystem operational diagnostic status.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.82rem",
              fontWeight: 500,
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-surface-elevated)",
              padding: "0.5rem 0.85rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "var(--primary-500)" }}
            />
            <span>Auto-refresh (20s)</span>
          </label>

          <button
            onClick={() => fetchHealth(true)}
            disabled={refreshing}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            <span>{refreshing ? "Probing..." : "Refresh Now"}</span>
          </button>
        </div>
      </div>

      {/* Error alert if health API fails */}
      {error && (
        <div
          style={{
            padding: "1rem 1.25rem",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "#f87171",
            marginBottom: "1.5rem",
          }}
        >
          <XCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Service Health Warning</div>
            <div style={{ fontSize: "0.82rem", marginTop: "0.15rem", color: "#fca5a5" }}>{error}</div>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {/* Database Status & Latency */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Database Connection
            </span>
            <div style={{ padding: "0.4rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.15)" }}>
              <Database size={16} style={{ color: "var(--primary-500)" }} />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {getStatusIcon(healthData?.subsystems?.database?.status, 16)}
              <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)" }}>
                {healthData?.subsystems?.database?.status === "OPERATIONAL" ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span>Live Query Latency:</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#34d399" }}>
                {healthData?.database?.latency_ms !== undefined
                  ? `${healthData.database.latency_ms} ms`
                  : healthData?.database_details?.latency_ms !== undefined
                  ? `${healthData.database_details.latency_ms} ms`
                  : dbHealth?.latency_ms !== undefined
                  ? `${dbHealth.latency_ms} ms`
                  : "N/A"}
              </span>
            </div>
          </div>
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>Live SELECT 1 Probe</span>
            <button
              onClick={runDedicatedDbProbe}
              disabled={probing}
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "var(--primary-500)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {probing ? "Pinging..." : "Test Ping →"}
            </button>
          </div>
        </div>

        {/* API Gateway & Network Latency */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              API Gateway
            </span>
            <div style={{ padding: "0.4rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.15)" }}>
              <Activity size={16} style={{ color: "var(--success)" }} />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {getStatusIcon(healthData?.subsystems?.api?.status, 16)}
              <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)" }}>
                {healthData?.subsystems?.api?.status === "OPERATIONAL" ? "Healthy" : "Degraded"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span>Roundtrip Response:</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#60a5fa" }}>
                {probeLatency !== null ? `${probeLatency} ms` : "Measuring..."}
              </span>
            </div>
          </div>
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>Service Gateway</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>v1.0.0</span>
          </div>
        </div>

        {/* Server Time & Uptime */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Application Server
            </span>
            <div style={{ padding: "0.4rem", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)" }}>
              <Server size={16} style={{ color: "var(--warning)" }} />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Clock size={16} style={{ color: "var(--primary-500)" }} />
              <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)" }}>
                {healthData?.server_time ? new Date(healthData.server_time).toLocaleTimeString() : "--:--:--"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span>Process Uptime:</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--text-main)" }}>
                {formatUptime(healthData?.uptime_seconds)}
              </span>
            </div>
          </div>
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>Environment</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              {healthData?.environment || "production"}
            </span>
          </div>
        </div>

        {/* Health Check Interval Log */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Health Verification
            </span>
            <div style={{ padding: "0.4rem", borderRadius: "8px", background: "rgba(168, 85, 247, 0.15)" }}>
              <ShieldCheck size={16} style={{ color: "#c084fc" }} />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span>Last Check:</span>
              <span style={{ fontWeight: 600, color: "#34d399" }}>
                {lastCheckTime ? lastCheckTime.toLocaleTimeString() : "Just now"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span>Failed Checks:</span>
              <span style={{ fontWeight: 600, color: healthData?.last_failed_check ? "#f87171" : "var(--text-subtle)" }}>
                {healthData?.last_failed_check ? new Date(healthData.last_failed_check).toLocaleTimeString() : "None"}
              </span>
            </div>
          </div>
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>Polling Frequency</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>20 seconds</span>
          </div>
        </div>
      </div>

      {/* Subsystems Comprehensive Status Grid */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
              Examination Subsystems
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
              Authoritative diagnostic status for all 10 platform architecture layers.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "1rem",
          }}
        >
          {subsystemsList.map((sub) => {
            const statusObj: SubsystemStatus | undefined = healthData?.subsystems?.[sub.key];
            const IconComponent = sub.icon;

            return (
              <div
                key={sub.key}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "var(--transition)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                      <div
                        style={{
                          padding: "0.55rem",
                          borderRadius: "10px",
                          background: "var(--bg-surface-elevated)",
                          border: "1px solid var(--border-color)",
                          color: "var(--primary-500)",
                        }}
                      >
                        <IconComponent size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                          {sub.title}
                        </h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-subtle)", margin: "0.15rem 0 0 0" }}>
                          {sub.description}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(statusObj?.status)}
                  </div>

                  {/* Human-readable message */}
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-main)",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.82rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {statusObj?.message || "Subsystem is fully operational and responsive."}
                  </div>
                </div>

                {/* Footer metrics */}
                <div
                  style={{
                    marginTop: "1rem",
                    paddingTop: "0.65rem",
                    borderTop: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "var(--text-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>Latency:</span>
                    <span style={{ color: "var(--text-main)", fontWeight: 600, fontFamily: "monospace" }}>
                      {statusObj?.latency_ms !== null && statusObj?.latency_ms !== undefined
                        ? `${statusObj.latency_ms} ms`
                        : "< 1 ms"}
                    </span>
                  </div>
                  <div>
                    <span>Checked: </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {statusObj?.last_checked_at ? new Date(statusObj.last_checked_at).toLocaleTimeString() : "Just now"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Diagnostic Safe Details Panel */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.75rem" }}>
          <ShieldCheck size={18} style={{ color: "var(--success)" }} />
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
            Security & Diagnostic Assurance
          </h3>
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
          Diagnostic health probes execute lightweight connection validation queries directly against PostgreSQL and core services. 
          To protect infrastructure integrity, zero connection strings, passwords, authentication tokens, private IP addresses, or internal stack traces are exposed.
        </p>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
