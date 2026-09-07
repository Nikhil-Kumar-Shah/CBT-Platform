"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NextLink from "next/link";
import { api, Subject, TestSeries } from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  FileText,
  Clock,
  ArrowRight,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

export default function CreateTestPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>Loading test creator...</div>}>
      <CreateTestContent />
    </Suspense>
  );
}

function CreateTestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Test Details
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicsCovered, setTopicsCovered] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(
    "1. All questions are compulsory.\n2. Please read each question carefully before answering.\n3. Do not refresh or navigate away from the test window."
  );
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [testSeriesId, setTestSeriesId] = useState(searchParams.get("test_series_id") || "");

  // Basic Exam Settings
  const [positiveMarks, setPositiveMarks] = useState(4.0);
  const [negativeMarks, setNegativeMarks] = useState(1.0);
  const [questionOrder, setQuestionOrder] = useState<"FIXED" | "RANDOM">("FIXED");
  const [optionOrder, setOptionOrder] = useState<"FIXED" | "RANDOM">("FIXED");
  const [allowResume, setAllowResume] = useState(true);
  const [resultVisibility, setResultVisibility] = useState<"IMMEDIATELY" | "HIDDEN" | "SCHEDULED">("IMMEDIATELY");
  const [showAnswers, setShowAnswers] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);

  // Availability Timing
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Collapsible Advanced Settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Options
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [seriesList, setSeriesList] = useState<TestSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sId = searchParams.get("test_series_id");
    if (sId) setTestSeriesId(sId);
    loadData();
  }, [searchParams]);

  const loadData = async () => {
    try {
      const [subjs, series] = await Promise.all([
        api.getSubjects(),
        api.listTestSeries({ page_size: 100 }),
      ]);
      setSubjects(subjs);
      if (subjs.length > 0 && !subjectId) {
        setSubjectId(subjs[0].id);
      }
      setSeriesList(series.items || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Test title is required.");
      return;
    }
    if (!subjectId) {
      setError("Please select a subject.");
      return;
    }
    if (durationMinutes <= 0) {
      setError("Duration must be greater than 0 minutes.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        title: title.trim(),
        subject_id: subjectId,
        topics_covered: topicsCovered.trim() || undefined,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        duration_minutes: Number(durationMinutes),
        test_series_id: testSeriesId || undefined,
        positive_marks: Number(positiveMarks),
        negative_marks: Number(negativeMarks),
        question_order: questionOrder,
        option_order: optionOrder,
        allow_resume: allowResume,
        result_visibility: resultVisibility,
        show_answers: showAnswers,
        show_explanation: showExplanation,
        start_time: startTime ? new Date(startTime).toISOString() : undefined,
        end_time: endTime ? new Date(endTime).toISOString() : undefined,
      };

      const created = await api.createTest(payload);
      // Immediately forward into Test Builder with auto_add=true to start authoring questions instantly
      router.push(`/admin/tests/${created.id}?step=questions&auto_add=true`);
    } catch (err: any) {
      setError(err.message || "Failed to create test paper.");
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "3rem", maxWidth: "960px" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Tests", href: "/admin/tests" },
          { label: "Create Test" },
        ]}
      />

      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
          Create New Examination Paper
        </h1>
        <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem" }}>
          Step 1 of 2: Define examination title, subject, topics covered, and exam rules.
        </p>
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
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleCreateTest}>
        {/* Step 1: Test Details Card */}
        <div className="card" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
            <FileText size={18} color="var(--primary-600)" />
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
              1. Test Details
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Test Title */}
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                Test Title <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Ray Optics & Wave Optics Full Mock"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ fontSize: "1rem", padding: "0.7rem 0.9rem" }}
              />
            </div>

            {/* Subject and Duration */}
            <div className="grid-2">
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Subject <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  className="input"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  required
                >
                  <option value="">Select Existing Subject</option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.code})
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "0.78rem", color: "var(--text-subtle)", marginTop: "0.25rem" }}>
                  Manage subjects anytime from Settings.
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Duration (Minutes) <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    className="input"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    required
                  />
                  <Clock
                    size={16}
                    style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                  />
                </div>
              </div>
            </div>

            {/* Topics Covered (ENTER topics as text/tags) */}
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                Topics Covered
              </label>
              <input
                type="text"
                className="input"
                placeholder="Enter topics as comma-separated tags (e.g. Reflection, Refraction, Lens Maker Formula, Wave Optics)"
                value={topicsCovered}
                onChange={(e) => setTopicsCovered(e.target.value)}
              />
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                Enter topics directly without requiring a separate topic management taxonomy.
              </div>
            </div>

            {/* Test Series (Optional) */}
            <div>
              <label className="form-label">
                Test Series <span style={{ color: "var(--text-subtle)", fontSize: "0.82rem" }}>(Optional)</span>
              </label>
              <select
                className="input"
                value={testSeriesId}
                onChange={(e) => setTestSeriesId(e.target.value)}
              >
                <option value="">Standalone Test (No Series)</option>
                {seriesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Description & Instructions */}
            <div className="grid-2">
              <div>
                <label className="form-label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Optional brief description for students..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Student Instructions</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Examination guidelines and rules..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Exam Settings & Rules (Collapsible with Institute Defaults) */}
        <div className="card" style={{ padding: "1.5rem", marginBottom: "1.75rem" }}>
          <div
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sliders size={18} color="var(--primary-600)" />
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                2. Exam Marking & Behavior Rules
              </h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                style={{
                  fontSize: "0.78rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "6px",
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "var(--primary-600)",
                  fontWeight: 600,
                }}
              >
                +{positiveMarks} / -{negativeMarks} Marks • {allowResume ? "Resume Allowed" : "No Resume"}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem" }}
              >
                {showAdvancedSettings ? "Hide Settings" : "Customize Rules"}
              </button>
            </div>
          </div>

          {showAdvancedSettings && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1.25rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.25rem" }}>
              {/* Marking Scheme */}
              <div className="grid-2">
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Default Positive Marks</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="input"
                    value={positiveMarks}
                    onChange={(e) => setPositiveMarks(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Default Negative Marks</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    className="input"
                    value={negativeMarks}
                    onChange={(e) => setNegativeMarks(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Question & Option Randomization */}
              <div className="grid-2">
                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={questionOrder === "RANDOM"}
                    onChange={(e) => setQuestionOrder(e.target.checked ? "RANDOM" : "FIXED")}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                      Randomize Question Order
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Each candidate sees a shuffled question sequence
                    </div>
                  </div>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={optionOrder === "RANDOM"}
                    onChange={(e) => setOptionOrder(e.target.checked ? "RANDOM" : "FIXED")}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                      Randomize Option Order
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Shuffle option choices (A, B, C, D) per student
                    </div>
                  </div>
                </label>
              </div>

              {/* Candidate Resume & Result Visibility */}
              <div className="grid-2">
                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={allowResume}
                    onChange={(e) => setAllowResume(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                      Allow Candidate Resume
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Permit candidates to reconnect if connection drops
                    </div>
                  </div>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showAnswers}
                    onChange={(e) => setShowAnswers(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                      Show Correct Answers
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Display answer key to student after submission
                    </div>
                  </div>
                </label>
              </div>

              {/* Scheduled Availability Window (Optional) */}
              <div className="grid-2">
                <div>
                  <label className="form-label">Start Time / Schedule Window</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <div style={{ fontSize: "0.76rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
                    Leave empty for immediate on-demand test.
                  </div>
                </div>
                <div>
                  <label className="form-label">End Time / Expiration Window</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation / Submission Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.25rem 0",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <NextLink href="/admin/tests" className="btn btn-secondary">
            Cancel
          </NextLink>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, padding: "0.75rem 1.5rem" }}
          >
            <span>{loading ? "Creating..." : "Create Test & Open Builder"}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
