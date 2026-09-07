"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";

export default function ExamError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Examination player error caught:", error);
  }, [error]);

  const handleReconnect = () => {
    // Attempt React reset first, otherwise soft reload
    try {
      reset();
    } catch (_) {
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "#080c14",
        color: "#ffffff",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "520px",
          width: "100%",
          padding: "2.5rem",
          textAlign: "center",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          background: "#0f172a",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            color: "#f87171",
          }}
        >
          <AlertTriangle size={28} />
        </div>

        <h2 style={{ fontSize: "1.45rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Examination Connection Issue
        </h2>

        <p
          style={{
            color: "#94a3b8",
            fontSize: "0.925rem",
            lineHeight: 1.6,
            marginBottom: "1.5rem",
          }}
        >
          A temporary rendering or connection interrupt occurred. Your answers and examination timer are authoritative and securely saved on the server.
        </p>

        <div
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "2rem",
            textAlign: "left",
            fontSize: "0.85rem",
            color: "#93c5fd",
          }}
        >
          <ShieldCheck size={20} style={{ flexShrink: 0, color: "#60a5fa" }} />
          <span>Your examination attempt has not been submitted or lost. Reconnecting will resume your paper where you left off.</span>
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button
            onClick={handleReconnect}
            className="btn btn-primary"
            style={{
              padding: "0.75rem 1.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontWeight: 600,
            }}
          >
            <RotateCcw size={16} />
            <span>Reconnect & Resume</span>
          </button>
          <button
            onClick={() => (window.location.href = "/exam")}
            className="btn btn-secondary"
            style={{ padding: "0.75rem 1.25rem" }}
          >
            Gateway
          </button>
        </div>
      </div>
    </div>
  );
}
