"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import NextLink from "next/link";
import { api, TestSeries, Test } from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Layers,
  Plus,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  FileText,
  Clock,
  CheckCircle,
  X,
  ExternalLink,
} from "lucide-react";

export default function SeriesManagementPage() {
  const params = useParams();
  const router = useRouter();
  const seriesId = params.id as string;

  const [series, setSeries] = useState<TestSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Existing Test Modal
  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [selectedTestIdToAdd, setSelectedTestIdToAdd] = useState("");
  const [addingTest, setAddingTest] = useState(false);

  useEffect(() => {
    loadSeries();
  }, [seriesId]);

  const loadSeries = async () => {
    try {
      setLoading(true);
      const data = await api.getTestSeries(seriesId);
      setSeries(data);
    } catch (e: any) {
      setError(e.message || "Failed to load test series");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = async () => {
    try {
      setShowAddTestModal(true);
      const res = await api.listTests({ page_size: 100 });
      // Exclude tests already in this series
      const currentTestIds = new Set((series?.tests || []).map((t) => t.id));
      const notInSeries = res.items.filter((t) => !currentTestIds.has(t.id));
      setAvailableTests(notInSeries);
      if (notInSeries.length > 0) {
        setSelectedTestIdToAdd(notInSeries[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTest = async () => {
    if (!selectedTestIdToAdd) return;
    try {
      setAddingTest(true);
      const updated = await api.addTestToSeries(seriesId, selectedTestIdToAdd);
      setSeries(updated);
      setShowAddTestModal(false);
    } catch (e: any) {
      alert(e.message || "Failed to add test to series");
    } finally {
      setAddingTest(false);
    }
  };

  const handleRemoveTest = async (testId: string) => {
    if (!confirm("Remove this test from the series? The test itself will not be deleted.")) return;
    try {
      const updated = await api.removeTestFromSeries(seriesId, testId);
      setSeries(updated);
    } catch (e: any) {
      alert(e.message || "Failed to remove test");
    }
  };

  const handleReorderTest = async (index: number, direction: "up" | "down") => {
    if (!series) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= series.tests.length) return;

    const newTests = [...series.tests];
    const temp = newTests[index];
    newTests[index] = newTests[targetIndex];
    newTests[targetIndex] = temp;

    setSeries({ ...series, tests: newTests });

    try {
      const testIds = newTests.map((t) => t.id);
      const updated = await api.reorderSeriesTests(seriesId, testIds);
      setSeries(updated);
    } catch (e: any) {
      alert(e.message || "Failed to reorder tests in series");
      loadSeries();
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "4rem 0", textAlign: "center", color: "var(--text-muted)" }}>
        Loading test series...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="container" style={{ padding: "4rem 0", textAlign: "center" }}>
        <h2>Series not found</h2>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "4rem" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Test Series", href: "/admin/test-series" },
          { label: series.name },
        ]}
      />

      {/* Series Details Card */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                {series.name}
              </h1>
              <span className={`badge ${series.status === "PUBLISHED" ? "badge-success" : "badge-warning"}`}>
                {series.status}
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
              Code: <strong style={{ fontFamily: "monospace", color: "var(--primary)" }}>{series.code}</strong> • {series.tests.length} Tests in Series
            </div>
            {series.description && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "0.75rem 0 0 0" }}>
                {series.description}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              onClick={handleOpenAddModal}
              className="btn btn-secondary btn-sm"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Plus size={14} />
              <span>Add Existing Test</span>
            </button>

            <NextLink
              href={`/admin/tests/new?test_series_id=${series.id}`}
              className="btn btn-primary btn-sm"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Plus size={14} />
              <span>Create Test in Series</span>
            </NextLink>
          </div>
        </div>
      </div>

      {/* Workflow Progression Communication (Test #1 -> Test #2 -> Test #3) */}
      {series.tests.length > 0 && (
        <div
          className="card"
          style={{
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
            background: "rgba(99, 102, 241, 0.05)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-600)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
            Curriculum Sequence Workflow
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {series.tests.map((test, idx) => (
              <React.Fragment key={test.id}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.75rem",
                    borderRadius: "6px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "var(--primary-600)" }}>Test #{idx + 1}</span>
                  <span style={{ color: "var(--text-main)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {test.title}
                  </span>
                  <span
                    className={`badge ${
                      test.status === "LIVE" || test.status === "PUBLISHED"
                        ? "badge-success"
                        : test.status === "SCHEDULED"
                        ? "badge-primary"
                        : test.status === "COMPLETED"
                        ? "badge"
                        : "badge-warning"
                    }`}
                    style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}
                  >
                    {test.status}
                  </span>
                </div>
                {idx < series.tests.length - 1 && (
                  <span style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: "1rem" }}>→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Tests in Series List with Reorder Controls */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 1.25rem 0" }}>
          Tests in this Series ({series.tests.length})
        </h2>

        {series.tests.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {series.tests.map((test, idx) => (
              <div
                key={test.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.9rem 1.2rem",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  gap: "1rem",
                }}
              >
                {/* Reorder Arrows & Sequence Badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <button
                      type="button"
                      onClick={() => handleReorderTest(idx, "up")}
                      disabled={idx === 0}
                      style={{
                        background: "none",
                        border: "none",
                        color: idx === 0 ? "var(--text-subtle)" : "var(--text-muted)",
                        cursor: idx === 0 ? "not-allowed" : "pointer",
                        padding: "0.1rem",
                      }}
                      title="Move up in sequence"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorderTest(idx, "down")}
                      disabled={idx === series.tests.length - 1}
                      style={{
                        background: "none",
                        border: "none",
                        color: idx === series.tests.length - 1 ? "var(--text-subtle)" : "var(--text-muted)",
                        cursor: idx === series.tests.length - 1 ? "not-allowed" : "pointer",
                        padding: "0.1rem",
                      }}
                      title="Move down in sequence"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--primary-600)", width: "24px", fontFamily: "monospace" }}>
                    #{idx + 1}
                  </div>
                </div>

                {/* Test Information */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <NextLink
                      href={`/admin/tests/${test.id}`}
                      style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-main)", textDecoration: "none" }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "var(--primary)")}
                      onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-main)")}
                    >
                      {test.title}
                    </NextLink>
                    <span
                      className={`badge ${
                        test.status === "LIVE" || test.status === "PUBLISHED"
                          ? "badge-success"
                          : test.status === "SCHEDULED"
                          ? "badge-primary"
                          : test.status === "COMPLETED"
                          ? "badge"
                          : "badge-warning"
                      }`}
                    >
                      {test.status}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <span>Code: <code style={{ color: "var(--primary)" }}>{test.code}</code></span>
                    <span>•</span>
                    <span>Subject: <strong style={{ color: "var(--text-main)" }}>{test.subject_name || "General"}</strong></span>
                    <span>•</span>
                    <span>{test.duration_minutes} mins</span>
                    <span>•</span>
                    <span>{test.question_count} Qs</span>
                    {test.total_marks != null && (
                      <>
                        <span>•</span>
                        <span style={{ color: "#34d399", fontWeight: 600 }}>{test.total_marks} Marks</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Contextual Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <NextLink href={`/admin/tests/${test.id}`} className="btn btn-secondary btn-sm">
                    Open
                  </NextLink>
                  <button
                    type="button"
                    onClick={() => handleRemoveTest(test.id)}
                    className="btn btn-secondary btn-sm"
                    style={{ color: "var(--danger)" }}
                    title="Remove from series"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center" }}>
            <FileText size={36} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: "0.75rem" }} />
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "0 0 1rem 0" }}>
              No tests have been added to this series yet.
            </p>
            <button onClick={handleOpenAddModal} className="btn btn-primary btn-sm">
              <Plus size={14} />
              <span>Add Existing Test</span>
            </button>
          </div>
        )}
      </div>

      {/* ADD EXISTING TEST MODAL */}
      {showAddTestModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "500px", padding: "1.75rem", background: "var(--bg-surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Add Existing Test to Series</h3>
              <button onClick={() => setShowAddTestModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            {availableTests.length > 0 ? (
              <div>
                <label className="form-label">Select Test</label>
                <select
                  className="form-control"
                  value={selectedTestIdToAdd}
                  onChange={(e) => setSelectedTestIdToAdd(e.target.value)}
                  style={{ marginBottom: "1.5rem" }}
                >
                  {availableTests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.code}) - {t.question_count} Qs
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button onClick={() => setShowAddTestModal(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button onClick={handleAddTest} disabled={addingTest} className="btn btn-primary">
                    {addingTest ? "Adding..." : "Add to Series"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <p style={{ color: "var(--text-muted)", margin: "0 0 1rem 0", fontSize: "0.9rem" }}>
                  All existing tests are already included in this series, or none exist yet.
                </p>
                <NextLink href="/admin/tests/new" className="btn btn-primary btn-sm">
                  Create a New Test Paper
                </NextLink>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
