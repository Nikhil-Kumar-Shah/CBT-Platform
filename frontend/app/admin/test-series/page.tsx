"use client";

import React, { useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { api, TestSeries } from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Layers,
  Plus,
  Search,
  MoreVertical,
  CheckCircle,
  Archive,
  ArrowRight,
  FileText,
  X,
} from "lucide-react";

export default function TestSeriesListPage() {
  const router = useRouter();
  const [seriesList, setSeriesList] = useState<TestSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState<string | null>(null);

  // Create Series Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadSeries();
  }, [search, statusFilter]);

  const loadSeries = async () => {
    try {
      setLoading(true);
      const res = await api.listTestSeries({
        search: search.trim() || undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      setSeriesList(res.items);
    } catch (e: any) {
      setError(e.message || "Failed to load test series");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setCreating(true);
      const created = await api.createTestSeries({
        name: newName.trim(),
        code: newCode.trim() ? newCode.trim().toUpperCase() : undefined,
        description: newDesc.trim() || undefined,
        status: "PUBLISHED",
      });
      setShowCreateModal(false);
      setNewName("");
      setNewCode("");
      setNewDesc("");
      router.push(`/admin/test-series/${created.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to create test series");
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Are you sure you want to archive this test series?")) return;
    try {
      await api.archiveTestSeries(id);
      loadSeries();
    } catch (e: any) {
      alert(e.message || "Failed to archive test series");
    }
  };

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Test Series" }]} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            Test Series
          </h1>
          <p style={{ margin: "0.2rem 0 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Curated bundles of tests covering complete curricula or syllabus milestones
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Plus size={16} />
          <span>Create Test Series</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "1rem" }}>
          <div style={{ position: "relative" }}>
            <Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search series by title or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>

          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Series Grid */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading series...</div>
      ) : seriesList.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {seriesList.map((series) => (
            <div key={series.id} className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-main)" }}>
                    {series.name}
                  </h3>
                  <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--primary)", background: "rgba(99,102,241,0.1)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                    {series.code}
                  </span>
                </div>
                <span className={`badge ${series.status === "PUBLISHED" ? "badge-success" : "badge-warning"}`}>
                  {series.status}
                </span>
              </div>

              {series.description && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 1rem 0", flex: 1, lineClamp: 2 }}>
                  {series.description}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                <span>{series.test_count} Tests ({series.published_test_count} Published)</span>
                <span>{series.total_attempts} Attempts</span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <NextLink
                  href={`/admin/test-series/${series.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  <span>Manage Tests</span>
                  <ArrowRight size={14} />
                </NextLink>

                <button
                  type="button"
                  onClick={() => handleArchive(series.id)}
                  className="btn btn-secondary btn-sm"
                  title="Archive Series"
                  style={{ color: "var(--danger)" }}
                >
                  <Archive size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: "4rem 1rem", textAlign: "center" }}>
          <Layers size={40} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: "0.75rem" }} />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>No Test Series Found</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "380px", margin: "0 auto 1.5rem auto" }}>
            Group multiple tests together (e.g., Chapter Tests, Mock Series) for organized student progression.
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            <Plus size={15} />
            <span>Create Test Series</span>
          </button>
        </div>
      )}

      {/* CREATE SERIES MODAL */}
      {showCreateModal && (
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
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Create Test Series</h3>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSeries}>
              <div style={{ marginBottom: "1rem" }}>
                <label className="form-label">Series Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g., JEE Physics Advanced Mock Series"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label className="form-label">Series Code (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Auto-generated if left blank"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Target audience, syllabus covered, or instructions..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creating || !newName.trim()} className="btn btn-primary">
                  {creating ? "Creating..." : "Create & Manage"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
