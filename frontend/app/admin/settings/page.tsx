"use client";

import React, { useEffect, useState } from "react";
import { api, Subject, User } from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Settings,
  BookOpen,
  Plus,
  CheckCircle2,
  Sliders,
  Save,
  Shield,
  Clock,
  Layers,
  Sparkles,
  Users,
  KeyRound,
  AlertCircle,
  Lock,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"subjects" | "security" | "defaults">("subjects");

  // Current User
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Subjects Management
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(true);
  const [newSubjName, setNewSubjName] = useState("");
  const [newSubjCode, setNewSubjCode] = useState("");
  const [creatingSubj, setCreatingSubj] = useState(false);
  const [deletingSubjId, setDeletingSubjId] = useState<string | null>(null);
  const [subjMsg, setSubjMsg] = useState<string | null>(null);
  const [subjErr, setSubjErr] = useState<string | null>(null);

  // Security / Password Change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [securityMsg, setSecurityMsg] = useState<string | null>(null);
  const [securityErr, setSecurityErr] = useState<string | null>(null);

  // System & Exam Defaults
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [defaultPositiveMarks, setDefaultPositiveMarks] = useState(4.0);
  const [defaultNegativeMarks, setDefaultNegativeMarks] = useState(1.0);
  const [defaultQuestionOrder, setDefaultQuestionOrder] = useState<"FIXED" | "RANDOM">("FIXED");
  const [defaultOptionOrder, setDefaultOptionOrder] = useState<"FIXED" | "RANDOM">("FIXED");
  const [defaultAllowResume, setDefaultAllowResume] = useState(true);
  const [defaultShowAnswers, setDefaultShowAnswers] = useState(true);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  useEffect(() => {
    loadSubjects();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const u = await api.getMe();
      setCurrentUser(u);
    } catch {}
  };

  const loadSubjects = async () => {
    try {
      setLoadingSubjects(true);
      const list = await api.getSubjects();
      setSubjects(list);
    } catch (e: any) {
      console.error("Failed to load subjects", e);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubjErr(null);
    setSubjMsg(null);
    const cleanName = newSubjName.trim();
    const cleanCode = newSubjCode.trim().toUpperCase();

    if (!cleanName) return;

    try {
      setCreatingSubj(true);
      await api.createSubject({
        name: cleanName,
        code: cleanCode || undefined,
      });
      setNewSubjName("");
      setNewSubjCode("");
      setSubjMsg("Subject registered successfully.");
      setTimeout(() => setSubjMsg(null), 3000);
      loadSubjects();
    } catch (err: any) {
      setSubjErr(err.message || "Failed to create subject.");
    } finally {
      setCreatingSubj(false);
    }
  };

  const handleDeleteSubject = async (subjId: string, subjName: string) => {
    if (!window.confirm(`Are you sure you want to delete subject "${subjName}"? This will permanently remove it and any unused topics.`)) {
      return;
    }
    setSubjErr(null);
    setSubjMsg(null);
    try {
      setDeletingSubjId(subjId);
      await api.deleteSubject(subjId, true);
      setSubjMsg(`Subject "${subjName}" was deleted successfully.`);
      setTimeout(() => setSubjMsg(null), 3000);
      loadSubjects();
    } catch (err: any) {
      setSubjErr(err.message || `Failed to delete subject "${subjName}".`);
    } finally {
      setDeletingSubjId(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityErr(null);
    setSecurityMsg(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setSecurityErr("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSecurityErr("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setSecurityErr("New password must be at least 8 characters long.");
      return;
    }

    try {
      setChangingPass(true);
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecurityMsg("Your password has been changed successfully.");
      setTimeout(() => setSecurityMsg(null), 4000);
    } catch (err: any) {
      setSecurityErr(err.message || "Failed to change password. Please verify your current password.");
    } finally {
      setChangingPass(false);
    }
  };

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(
      "cbt_exam_defaults",
      JSON.stringify({
        defaultDuration,
        defaultPositiveMarks,
        defaultNegativeMarks,
        defaultQuestionOrder,
        defaultOptionOrder,
        defaultAllowResume,
        defaultShowAnswers,
      })
    );
    setDefaultsSaved(true);
    setTimeout(() => setDefaultsSaved(false), 3000);
  };

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "4rem", maxWidth: "960px" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Settings" },
        ]}
      />

      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
          Platform Settings
        </h1>
        <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
          Manage examination subjects, security credentials, and system defaults.
        </p>
      </div>

      {/* Tabs */}
      <div className="nav-underline-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "subjects"}
          onClick={() => setActiveTab("subjects")}
          className={`nav-underline-tab ${activeTab === "subjects" ? "active" : ""}`}
        >
          <BookOpen size={16} />
          <span>Subjects ({subjects.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "security"}
          onClick={() => setActiveTab("security")}
          className={`nav-underline-tab ${activeTab === "security" ? "active" : ""}`}
        >
          <Lock size={16} />
          <span>Change Password</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "defaults"}
          onClick={() => setActiveTab("defaults")}
          className={`nav-underline-tab ${activeTab === "defaults" ? "active" : ""}`}
        >
          <Sliders size={16} />
          <span>Exam Defaults</span>
        </button>
      </div>

      {/* TAB 1: SUBJECTS MANAGEMENT */}
      {activeTab === "subjects" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "0.35rem" }}>
              Add Subject
            </h2>
            <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Add an academic subject or course category. Subject codes are generated automatically.
            </p>

            {subjMsg && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "var(--success-bg, rgba(16, 185, 129, 0.12))",
                  border: "1px solid var(--success)",
                  borderRadius: "6px",
                  color: "#10b981",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.85rem",
                }}
              >
                <CheckCircle2 size={15} />
                <span>{subjMsg}</span>
              </div>
            )}

            {subjErr && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  borderRadius: "6px",
                  color: "var(--danger)",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.85rem",
                }}
              >
                <AlertCircle size={15} />
                <span>{subjErr}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubject} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <label className="form-label">Subject Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Physics, Mathematics, Chemistry, Biology"
                  className="input"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creatingSubj}
                className="btn btn-primary"
                style={{ fontWeight: 700, padding: "0.7rem 1.25rem" }}
              >
                <Plus size={16} />
                <span>{creatingSubj ? "Adding..." : "Add Subject"}</span>
              </button>
            </form>
          </div>

          {/* Existing Subjects Table */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--text-main)" }}>
                Existing Subjects
              </h3>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                {subjects.length} total registered
              </span>
            </div>

            {loadingSubjects ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                Loading subjects...
              </div>
            ) : subjects.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                      <th style={{ padding: "0.75rem 1.25rem" }}>Subject Name</th>
                      <th style={{ padding: "0.75rem 1.25rem" }}>Code Prefix</th>
                      <th style={{ padding: "0.75rem 1.25rem" }}>Status</th>
                      <th style={{ padding: "0.75rem 1.25rem" }}>Created Date</th>
                      <th style={{ padding: "0.75rem 1.25rem", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((sub) => (
                      <tr key={sub.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "0.9rem 1.25rem", fontWeight: 600, color: "var(--text-main)" }}>
                          {sub.name}
                        </td>
                        <td style={{ padding: "0.9rem 1.25rem" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, background: "rgba(99, 102, 241, 0.15)", color: "var(--primary-600)", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
                            {sub.code}
                          </span>
                        </td>
                        <td style={{ padding: "0.9rem 1.25rem" }}>
                          <span className="badge badge-success">{sub.status}</span>
                        </td>
                        <td style={{ padding: "0.9rem 1.25rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                          {new Date(sub.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "0.9rem 1.25rem", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubject(sub.id, sub.name)}
                            disabled={deletingSubjId === sub.id}
                            className="btn btn-outline"
                            style={{
                              padding: "0.35rem 0.65rem",
                              fontSize: "0.8rem",
                              color: "var(--danger)",
                              borderColor: "var(--danger-border)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              cursor: deletingSubjId === sub.id ? "not-allowed" : "pointer",
                              opacity: deletingSubjId === sub.id ? 0.6 : 1,
                            }}
                            title={`Delete ${sub.name}`}
                          >
                            <Trash2 size={14} />
                            <span>{deletingSubjId === sub.id ? "Deleting..." : "Delete"}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                No subjects registered. Add your first subject above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CHANGE PASSWORD */}
      {activeTab === "security" && (
        <div className="card" style={{ padding: "1.75rem", maxWidth: "550px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "0.35rem" }}>
            Change Account Password
          </h2>
          <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Update your login credentials. Your existing active sessions will be preserved or re-authenticated safely.
          </p>

          {securityMsg && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "var(--success-bg, rgba(16, 185, 129, 0.12))",
                border: "1px solid var(--success)",
                borderRadius: "6px",
                color: "#10b981",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
              }}
            >
              <CheckCircle2 size={15} />
              <span>{securityMsg}</span>
            </div>
          )}

          {securityErr && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                borderRadius: "6px",
                color: "var(--danger)",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
              }}
            >
              <AlertCircle size={15} />
              <span>{securityErr}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "1.1rem", maxWidth: "460px" }}>
            <div>
              <label className="form-label">Current Password *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showCurrentPass ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="input"
                  style={{ paddingRight: "2.4rem" }}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-subtle)",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={showCurrentPass ? "Hide password" : "Show password"}
                  aria-label={showCurrentPass ? "Hide password" : "Show password"}
                >
                  {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="form-label">New Password (Min 8 Characters) *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNewPass ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input"
                  style={{ paddingRight: "2.4rem" }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-subtle)",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={showNewPass ? "Hide password" : "Show password"}
                  aria-label={showNewPass ? "Hide password" : "Show password"}
                >
                  {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="form-label">Confirm New Password *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPass ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input"
                  style={{ paddingRight: "2.4rem" }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-subtle)",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={showConfirmPass ? "Hide password" : "Show password"}
                  aria-label={showConfirmPass ? "Hide password" : "Show password"}
                >
                  {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={changingPass}
                className="btn btn-primary"
                style={{ fontWeight: 700, padding: "0.75rem 1.5rem" }}
              >
                <KeyRound size={16} />
                <span>{changingPass ? "Updating Password..." : "Update Password"}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: EXAM CONFIGURATION DEFAULTS */}
      {activeTab === "defaults" && (
        <form onSubmit={handleSaveDefaults} className="card" style={{ padding: "1.75rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "0.35rem" }}>
            Default Examination Rules & Defaults
          </h2>
          <p style={{ margin: "0 0 1.5rem 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            These settings automatically prefill when creating new examination papers.
          </p>

          {defaultsSaved && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid var(--success)",
                borderRadius: "6px",
                color: "#34d399",
                marginBottom: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
              }}
            >
              <CheckCircle2 size={15} />
              <span>Defaults updated successfully.</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="grid-2">
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Default Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={defaultDuration}
                  onChange={(e) => setDefaultDuration(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Default Positive Marks</label>
                <input
                  type="number"
                  step="0.5"
                  className="input"
                  value={defaultPositiveMarks}
                  onChange={(e) => setDefaultPositiveMarks(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid-2">
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Default Negative Marks</label>
                <input
                  type="number"
                  step="0.25"
                  className="input"
                  value={defaultNegativeMarks}
                  onChange={(e) => setDefaultNegativeMarks(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Default Question Order</label>
                <select
                  className="input"
                  value={defaultQuestionOrder}
                  onChange={(e: any) => setDefaultQuestionOrder(e.target.value)}
                >
                  <option value="FIXED">Fixed Sequence</option>
                  <option value="RANDOM">Randomize Question Sequence</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={defaultAllowResume}
                  onChange={(e) => setDefaultAllowResume(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                    Allow Candidate Resume by Default
                  </div>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={defaultShowAnswers}
                  onChange={(e) => setDefaultShowAnswers(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                    Show Correct Answers Post-Exam
                  </div>
                </div>
              </label>
            </div>

            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", fontWeight: 700 }}
              >
                <Save size={15} />
                <span>Save Configuration Defaults</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
