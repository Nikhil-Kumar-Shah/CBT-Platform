"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  api,
  AuditEvent,
  AuditEventListResponse,
  AuditFilterParams,
} from "@/lib/api";
import {
  ScrollText,
  Search,
  Filter,
  RefreshCw,
  Shield,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Info,
  Calendar,
  User as UserIcon,
  Server,
  FileText,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Lock,
} from "lucide-react";

export default function UniversalAuditCenterPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [pages, setPages] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [search, setSearch] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  const [resourceType, setResourceType] = useState<string>("");

  // Drawer / Detail modal state
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const fetchEvents = useCallback(
    async (currentPage = page, isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const params: AuditFilterParams = {
          page: currentPage,
          page_size: pageSize,
        };
        if (search.trim()) params.search = search.trim();
        if (category) params.category = category;
        if (severity) params.severity = severity;
        if (actor.trim()) params.actor = actor.trim();
        if (resourceType) params.resource_type = resourceType;

        const res = await api.listAuditEvents(params);
        setEvents(res.items);
        setTotal(res.total);
        setPages(res.pages);
      } catch (err: any) {
        console.error("Failed to load audit events:", err);
        setError("Unable to load universal audit logs. Please check server connectivity.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, search, category, severity, actor, resourceType]
  );

  useEffect(() => {
    fetchEvents(page);
  }, [page, pageSize, category, severity, resourceType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEvents(1);
  };

  const handleResetFilters = () => {
    setSearch("");
    setCategory("");
    setSeverity("");
    setActor("");
    setResourceType("");
    setPage(1);
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev.toUpperCase()) {
      case "CRITICAL":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.2rem 0.55rem",
              fontSize: "0.72rem",
              fontWeight: 600,
              borderRadius: "9999px",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <ShieldAlert size={12} />
            CRITICAL
          </span>
        );
      case "WARNING":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.2rem 0.55rem",
              fontSize: "0.72rem",
              fontWeight: 600,
              borderRadius: "9999px",
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <AlertCircle size={12} />
            WARNING
          </span>
        );
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.2rem 0.55rem",
              fontSize: "0.72rem",
              fontWeight: 600,
              borderRadius: "9999px",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            <CheckCircle2 size={12} />
            INFO
          </span>
        );
    }
  };

  const getCategoryBadge = (cat: string) => {
    let color = "var(--primary-600)";
    let bg = "rgba(99, 102, 241, 0.15)";
    let border = "rgba(99, 102, 241, 0.25)";

    switch (cat.toUpperCase()) {
      case "SECURITY":
        color = "#f87171";
        bg = "rgba(239, 68, 68, 0.15)";
        border = "rgba(239, 68, 68, 0.25)";
        break;
      case "CANDIDATES":
        color = "#38bdf8";
        bg = "rgba(14, 165, 233, 0.15)";
        border = "rgba(14, 165, 233, 0.25)";
        break;
      case "EXAM":
        color = "#c084fc";
        bg = "rgba(168, 85, 247, 0.15)";
        border = "rgba(168, 85, 247, 0.25)";
        break;
      case "QUESTIONS":
        color = "#fbbf24";
        bg = "rgba(245, 158, 11, 0.15)";
        border = "rgba(245, 158, 11, 0.25)";
        break;
      case "SYSTEM":
        color = "#94a3b8";
        bg = "rgba(148, 163, 184, 0.15)";
        border = "rgba(148, 163, 184, 0.25)";
        break;
    }

    return (
      <span
        style={{
          display: "inline-block",
          padding: "0.15rem 0.5rem",
          fontSize: "0.7rem",
          fontWeight: 700,
          borderRadius: "4px",
          color,
          background: bg,
          border: `1px solid ${border}`,
          letterSpacing: "0.03em",
        }}
      >
        {cat}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: "1350px", margin: "0 auto", padding: "1.75rem 1.5rem" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
          paddingBottom: "1.25rem",
          borderBottom: "1px solid var(--border-color)",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
              Universal Audit Center
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.2rem 0.6rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: "9999px",
                background: "rgba(99, 102, 241, 0.15)",
                color: "var(--primary-600)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
              }}
            >
              <Shield size={13} />
              System-Wide Append-Only Log
            </span>
          </div>
          <p style={{ margin: "0.35rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Immutable timeline of administrative operations, test management, candidate sessions, security attempts, and system telemetry.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            onClick={() => fetchEvents(page, true)}
            disabled={refreshing}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            <span>{refreshing ? "Refreshing..." : "Refresh Events"}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          {/* Search text */}
          <div style={{ position: "relative", gridColumn: "span 2" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "0.85rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-subtle)",
              }}
            />
            <input
              type="text"
              placeholder="Search description, action, actor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ paddingLeft: "2.3rem", fontSize: "0.85rem", height: "38px" }}
            />
          </div>

          {/* Actor filter */}
          <div>
            <input
              type="text"
              placeholder="Filter by Actor"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="form-control"
              style={{ fontSize: "0.85rem", height: "38px" }}
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ fontSize: "0.85rem", height: "38px", cursor: "pointer" }}
            >
              <option value="">All Categories</option>
              <option value="ADMIN">ADMIN</option>
              <option value="QUESTIONS">QUESTIONS</option>
              <option value="CANDIDATES">CANDIDATES</option>
              <option value="EXAM">EXAM</option>
              <option value="SECURITY">SECURITY</option>
              <option value="SYSTEM">SYSTEM</option>
            </select>
          </div>

          {/* Severity Dropdown */}
          <div>
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ fontSize: "0.85rem", height: "38px", cursor: "pointer" }}
            >
              <option value="">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>

          {/* Resource Type Dropdown */}
          <div>
            <select
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ fontSize: "0.85rem", height: "38px", cursor: "pointer" }}
            >
              <option value="">All Resources</option>
              <option value="TEST">TEST</option>
              <option value="QUESTION">QUESTION</option>
              <option value="ATTEMPT">ATTEMPT</option>
              <option value="USER">USER</option>
              <option value="ENDPOINT">ENDPOINT</option>
              <option value="SYSTEM">SYSTEM</option>
            </select>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: "100%",
                height: "38px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <Filter size={14} />
              <span>Apply</span>
            </button>
          </div>
        </form>

        {/* Active Filter Tags */}
        {(search || category || severity || resourceType || actor) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.75rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border-color)",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            <span>Active filters:</span>
            {search && (
              <span style={{ padding: "0.15rem 0.5rem", background: "var(--bg-surface-elevated)", borderRadius: "4px", color: "var(--text-main)" }}>
                Search: "{search}"
              </span>
            )}
            {category && (
              <span style={{ padding: "0.15rem 0.5rem", background: "rgba(99, 102, 241, 0.2)", borderRadius: "4px", color: "var(--primary-600)" }}>
                Category: {category}
              </span>
            )}
            {severity && (
              <span style={{ padding: "0.15rem 0.5rem", background: "rgba(245, 158, 11, 0.2)", borderRadius: "4px", color: "#fbbf24" }}>
                Severity: {severity}
              </span>
            )}
            {resourceType && (
              <span style={{ padding: "0.15rem 0.5rem", background: "rgba(14, 165, 233, 0.2)", borderRadius: "4px", color: "#38bdf8" }}>
                Resource: {resourceType}
              </span>
            )}
            {actor && (
              <span style={{ padding: "0.15rem 0.5rem", background: "var(--bg-surface-elevated)", borderRadius: "4px", color: "var(--text-main)" }}>
                Actor: "{actor}"
              </span>
            )}
            <button
              onClick={handleResetFilters}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "var(--primary-500)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.8rem",
              }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "#f87171",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "var(--bg-surface-elevated)",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.82rem",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            Total Audit Records: <strong style={{ color: "var(--text-main)" }}>{total.toLocaleString()}</strong>
          </span>
          <span style={{ color: "var(--text-subtle)" }}>
            Page {page} of {pages}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-main)",
                  borderBottom: "1px solid var(--border-color)",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ padding: "0.75rem 1rem" }}>Timestamp</th>
                <th style={{ padding: "0.75rem 1rem" }}>Event & Description</th>
                <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                <th style={{ padding: "0.75rem 1rem" }}>Actor</th>
                <th style={{ padding: "0.75rem 1rem" }}>Resource</th>
                <th style={{ padding: "0.75rem 1rem" }}>Severity</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-subtle)" }}>
                    <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 0.5rem auto", color: "var(--primary-500)" }} />
                    <div>Loading universal audit logs...</div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-subtle)" }}>
                    <ScrollText size={32} style={{ margin: "0 auto 0.5rem auto", opacity: 0.4 }} />
                    <div>No audit records match your selected criteria.</div>
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const date = new Date(ev.timestamp);
                  const timeFormatted = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  const dateFormatted = date.toLocaleDateString([], { month: "short", day: "numeric" });

                  return (
                    <tr
                      key={ev.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "var(--transition)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      {/* Timestamp */}
                      <td style={{ padding: "0.85rem 1rem", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-main)", fontWeight: 600, fontFamily: "monospace", fontSize: "0.82rem" }}>
                          <Clock size={12} style={{ color: "var(--text-subtle)" }} />
                          {timeFormatted}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
                          {dateFormatted}
                        </div>
                      </td>

                      {/* Event & Description */}
                      <td style={{ padding: "0.85rem 1rem", maxWidth: "320px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>
                          {ev.description || ev.event_type}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", fontFamily: "monospace", marginTop: "0.2rem" }}>
                          {ev.event_type}
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: "0.85rem 1rem", whiteSpace: "nowrap" }}>
                        {getCategoryBadge(ev.category)}
                      </td>

                      {/* Actor */}
                      <td style={{ padding: "0.85rem 1rem", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-main)", fontWeight: 500 }}>
                          <UserIcon size={13} style={{ color: "var(--text-subtle)" }} />
                          <span>{ev.actor || "System"}</span>
                        </div>
                        {ev.actor_type && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "capitalize", marginTop: "0.15rem" }}>
                            {ev.actor_type}
                          </div>
                        )}
                      </td>

                      {/* Resource */}
                      <td style={{ padding: "0.85rem 1rem", whiteSpace: "nowrap" }}>
                        {ev.resource_type ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                              background: "var(--bg-surface-elevated)",
                              color: "var(--text-muted)",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                            }}
                          >
                            {ev.resource_type}
                            {ev.resource_id ? ` #${String(ev.resource_id).substring(0, 8)}` : ""}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-subtle)", fontSize: "0.75rem" }}>—</span>
                        )}
                      </td>

                      {/* Severity */}
                      <td style={{ padding: "0.85rem 1rem", whiteSpace: "nowrap" }}>
                        {getSeverityBadge(ev.severity)}
                      </td>

                      {/* Action */}
                      <td style={{ padding: "0.85rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "var(--bg-surface-elevated)",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                color: "var(--text-main)",
                borderRadius: "var(--radius-sm)",
                padding: "0.25rem 0.5rem",
                fontSize: "0.8rem",
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn btn-secondary btn-sm"
              style={{ padding: "0.3rem 0.6rem" }}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0 0.5rem" }}>
              {page} / {pages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
              className="btn btn-secondary btn-sm"
              style={{ padding: "0.3rem 0.6rem" }}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "680px" }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: "1rem",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                <ScrollText size={18} style={{ color: "var(--primary-500)" }} />
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                  Audit Event Details
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "0.25rem",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Event headline card */}
              <div
                style={{
                  padding: "1rem",
                  background: "var(--bg-main)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)" }}>
                    {selectedEvent.description || selectedEvent.event_type}
                  </div>
                  {getSeverityBadge(selectedEvent.severity)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                  <span>Event Type:</span>
                  <code style={{ background: "var(--bg-surface)", padding: "0.1rem 0.35rem", borderRadius: "3px", color: "var(--text-muted)" }}>
                    {selectedEvent.event_type}
                  </code>
                </div>
              </div>

              {/* Grid of Key Properties */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>Timestamp</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "0.25rem", fontFamily: "monospace" }}>
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </div>
                </div>

                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>Category</div>
                  <div style={{ marginTop: "0.25rem" }}>{getCategoryBadge(selectedEvent.category)}</div>
                </div>

                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>Actor</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "0.25rem" }}>
                    {selectedEvent.actor} <span style={{ color: "var(--text-subtle)", fontSize: "0.75rem" }}>({selectedEvent.actor_type})</span>
                  </div>
                </div>

                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>Target Resource</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "0.25rem" }}>
                    {selectedEvent.resource_type || "N/A"}{" "}
                    {selectedEvent.resource_id ? `(#${selectedEvent.resource_id})` : ""}
                  </div>
                </div>

                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>Client IP Address</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "0.25rem", fontFamily: "monospace" }}>
                    {selectedEvent.ip_address || "Unavailable"}
                  </div>
                </div>

                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>Action</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "0.25rem", fontFamily: "monospace" }}>
                    {selectedEvent.action || "N/A"}
                  </div>
                </div>
              </div>

              {/* Sanitized Context / Details JSON */}
              {selectedEvent.details && Object.keys(selectedEvent.details).length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    Audit Event Context & Metadata
                  </div>
                  <pre
                    style={{
                      background: "var(--bg-main)",
                      padding: "0.85rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-color)",
                      color: "#94a3b8",
                      fontSize: "0.78rem",
                      fontFamily: "monospace",
                      overflowX: "auto",
                      maxHeight: "220px",
                    }}
                  >
                    {JSON.stringify(selectedEvent.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                marginTop: "1.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setSelectedEvent(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
