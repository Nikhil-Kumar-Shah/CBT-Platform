"use client";

import React, { useState } from "react";
import NextLink from "next/link";
import { Question, api } from "@/lib/api";
import { MathRenderer } from "@/components/MathRenderer";
import { Edit2, Archive, CheckCircle2, ChevronDown, ChevronUp, Eye } from "lucide-react";

interface QuestionCardProps {
  question: Question;
  onArchived?: (id: string) => void;
  onPreview?: (question: Question) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ question, onArchived, onPreview }) => {
  const [expanded, setExpanded] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this question? It will be deactivated from active pools.")) {
      return;
    }
    setArchiving(true);
    try {
      await api.archiveQuestion(question.id);
      if (onArchived) onArchived(question.id);
    } catch (err) {
      alert("Failed to archive question.");
    } finally {
      setArchiving(false);
    }
  };

  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case "EASY": return <span className="badge badge-easy">EASY</span>;
      case "HARD": return <span className="badge badge-hard">HARD</span>;
      default: return <span className="badge badge-medium">MEDIUM</span>;
    }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", transition: "var(--transition)" }}>
      {/* Header Info */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className={`badge ${question.question_type === "MCQ" ? "badge-mcq" : "badge-numerical"}`}>
            {question.question_type}
          </span>
          {getDifficultyBadge(question.difficulty)}
          <span className={`badge ${question.status === "ACTIVE" ? "badge-active" : "badge-archived"}`}>
            {question.status}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-subtle)", marginLeft: "0.25rem" }}>
            {question.subject_name || "General"} {question.topic_name ? `› ${question.topic_name}` : ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "0.2rem 0.5rem", borderRadius: "var(--radius-sm)" }}>
            +{question.marks} / -{question.negative_marks}
          </span>

          {onPreview && (
            <button
              onClick={() => onPreview(question)}
              className="btn btn-secondary btn-sm"
              title="Full Preview"
            >
              <Eye size={13} />
            </button>
          )}

          <NextLink href={`/admin/questions/${question.id}/edit`} className="btn btn-secondary btn-sm" title="Edit Question">
            <Edit2 size={13} />
            <span>Edit</span>
          </NextLink>

          {question.status === "ACTIVE" && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="btn btn-danger btn-sm"
              title="Archive Question"
            >
              <Archive size={13} />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* Question Content */}
      <div style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-main)" }}>
        <MathRenderer content={question.content} />
      </div>

      {/* Images */}
      {question.media && question.media.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", margin: "0.25rem 0" }}>
          {question.media.map((m) => (
            <img
              key={m.id}
              src={m.url}
              alt={m.original_filename}
              style={{
                maxHeight: "140px",
                maxWidth: "100%",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-color)",
                objectFit: "contain",
                backgroundColor: "#000",
              }}
            />
          ))}
        </div>
      )}

      {/* Options Summary or Numerical Answer */}
      {question.question_type === "MCQ" && question.options && question.options.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.25rem" }}>
          {question.options.map((opt) => (
            <div
              key={opt.option_order}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
                padding: "0.45rem 0.75rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: opt.is_correct ? "rgba(16, 185, 129, 0.08)" : "var(--bg-input)",
                border: opt.is_correct ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                fontSize: "0.88rem",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: opt.is_correct ? "#34d399" : "var(--text-subtle)",
                  minWidth: "18px",
                }}
              >
                {String.fromCharCode(64 + opt.option_order)}.
              </span>
              <div style={{ flex: 1 }}>
                <MathRenderer content={opt.content} />
              </div>
              {opt.is_correct && (
                <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
              )}
            </div>
          ))}
        </div>
      )}

      {question.question_type === "NUMERICAL" && (
        <div
          style={{
            padding: "0.5rem 0.8rem",
            backgroundColor: "rgba(14, 165, 233, 0.08)",
            border: "1px solid rgba(14, 165, 233, 0.3)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.88rem",
            color: "#38bdf8",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontWeight: 600 }}>Correct Answer:</span>
          <MathRenderer inline content={String(question.numerical_answer || "")} />
          {question.numerical_tolerance ? (
            <span style={{ color: "var(--text-subtle)", fontSize: "0.8rem" }}>
              (± {question.numerical_tolerance})
            </span>
          ) : null}
        </div>
      )}

      {/* Explanation Toggle */}
      {question.explanation && (
        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <span>{expanded ? "Hide Explanation" : "View Explanation"}</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.6rem 0.8rem",
                backgroundColor: "var(--bg-surface-elevated)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              <MathRenderer content={question.explanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
