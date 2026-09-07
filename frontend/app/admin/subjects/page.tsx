"use client";

import React, { useEffect, useState } from "react";
import NextLink from "next/link";
import { api, Subject, Topic } from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Plus,
  BookOpen,
  Layers,
  Check,
  AlertCircle,
  FolderTree,
  Trash2,
  Edit2,
  ChevronRight,
} from "lucide-react";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newSubjName, setNewSubjName] = useState("");
  const [newSubjCode, setNewSubjCode] = useState("");
  const [selectedSubjId, setSelectedSubjId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [subjList, topicList] = await Promise.all([
        api.getSubjects(),
        api.getTopics(),
      ]);
      setSubjects(subjList);
      setTopics(topicList);
      if (!selectedSubjId && subjList.length > 0) {
        setSelectedSubjId(subjList[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load taxonomy.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanName = newSubjName.trim();
    const cleanCode = newSubjCode.trim().toUpperCase();

    if (!cleanName) return;

    try {
      const created = await api.createSubject({
        name: cleanName,
        code: cleanCode || undefined,
      });
      setSubjects([...subjects, created]);
      setSelectedSubjId(created.id);
      setNewSubjName("");
      setNewSubjCode("");
      setSuccess(`Subject '${created.name}' created successfully.`);
    } catch (err: any) {
      setError(err.message || "Failed to create subject.");
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedSubjId) {
      setError("Please select a subject first.");
      return;
    }

    try {
      const created = await api.createTopic({
        subject_id: selectedSubjId,
        name: newTopicName.trim(),
      });
      setTopics([...topics, created]);
      setNewTopicName("");
      setSuccess(`Topic '${created.name}' added successfully.`);
    } catch (err: any) {
      setError(err.message || "Failed to create topic.");
    }
  };

  const handleDeleteSubject = async (subjId: string, subjName: string) => {
    if (!window.confirm(`Are you sure you want to delete subject "${subjName}"? This will permanently remove it and all associated topics.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await api.deleteSubject(subjId, true);
      setSuccess(`Subject "${subjName}" was deleted successfully.`);
      const remaining = subjects.filter((s) => s.id !== subjId);
      setSubjects(remaining);
      setSelectedSubjId(remaining.length > 0 ? remaining[0].id : "");
      loadData();
    } catch (err: any) {
      setError(err.message || `Failed to delete subject "${subjName}".`);
    }
  };

  const selectedSubject = subjects.find((s) => s.id === selectedSubjId);
  const currentTopics = topics.filter((t) => t.subject_id === selectedSubjId);

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Manage Subjects & Topics" },
        ]}
      />

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
          Subjects & Topics Taxonomy
        </h1>
        <p style={{ margin: "0.2rem 0 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Organize questions systematically into academic subjects and chapters
        </p>
      </div>

      {error && (
        <div style={{ padding: "0.85rem 1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--danger)", borderRadius: "8px", color: "var(--danger)", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{ padding: "0.85rem 1rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--success)", borderRadius: "8px", color: "var(--success)", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Two Column Layout: Subjects on Left, Topics of selected subject on Right */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Subjects List + Add Subject Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.35rem 0" }}>Add New Subject</h3>
            <p style={{ margin: "0 0 0.85rem 0", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Codes are automatically generated.
            </p>
            <form onSubmit={handleCreateSubject}>
              <div style={{ marginBottom: "0.85rem" }}>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>Subject Name *</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g., Mathematics"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }}>
                <Plus size={14} />
                <span>Create Subject</span>
              </button>
            </form>
          </div>

          {/* Subjects Hierarchy List */}
          <div className="card" style={{ padding: "0.75rem 0.5rem" }}>
            <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
              ALL SUBJECTS ({subjects.length})
            </div>
            {subjects.map((s) => {
              const isSelected = s.id === selectedSubjId;
              const topicCount = topics.filter((t) => t.subject_id === s.id).length;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSubjId(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 0.85rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: isSelected ? "rgba(99, 102, 241, 0.15)" : "transparent",
                    color: isSelected ? "var(--primary)" : "var(--text-main)",
                    fontWeight: isSelected ? 600 : 400,
                    marginBottom: "0.25rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <BookOpen size={15} />
                    <span>{s.name}</span>
                    <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted)" }}>({s.code})</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{topicCount}</span>
                    <ChevronRight size={14} color={isSelected ? "var(--primary)" : "var(--text-muted)"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Topics Hierarchy of Selected Subject */}
        <div className="card" style={{ padding: "1.5rem" }}>
          {selectedSubject ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                    {selectedSubject.name} Topics
                  </h2>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Code: {selectedSubject.code} • {currentTopics.length} Chapters / Topics configured
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSubject(selectedSubject.id, selectedSubject.name)}
                  className="btn btn-outline"
                  style={{
                    padding: "0.4rem 0.75rem",
                    fontSize: "0.8rem",
                    color: "var(--danger)",
                    borderColor: "var(--danger-border)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontWeight: 600,
                  }}
                  title={`Delete ${selectedSubject.name}`}
                >
                  <Trash2 size={14} />
                  <span>Delete Subject</span>
                </button>
              </div>

              {/* Add Topic Form */}
              <form onSubmit={handleCreateTopic} style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder={`Add a new chapter/topic to ${selectedSubject.name}...`}
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Plus size={15} />
                  <span>Add Topic</span>
                </button>
              </form>

              {/* Topics Tree / List */}
              {currentTopics.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {currentTopics.map((topic, idx) => (
                    <div
                      key={topic.id}
                      style={{
                        padding: "0.75rem 1rem",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                          {idx + 1}.
                        </span>
                        <span style={{ fontWeight: 500, fontSize: "0.95rem" }}>{topic.name}</span>
                      </div>
                      <span className="badge badge-success" style={{ fontSize: "0.7rem" }}>
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                  <p style={{ margin: "0 0 0.5rem 0" }}>No topics found for {selectedSubject.name}.</p>
                  <span style={{ fontSize: "0.85rem" }}>Add chapters above to help classify questions.</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Select or create a subject on the left to view and manage topics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
