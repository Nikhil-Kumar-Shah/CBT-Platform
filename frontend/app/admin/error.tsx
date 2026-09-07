"use client";

import React, { useEffect } from "react";
import { AlertCircle, RotateCcw, LayoutDashboard } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin portal error:", error);
  }, [error]);

  return (
    <div
      style={{
        padding: "3rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "540px",
          width: "100%",
          padding: "2.5rem",
          textAlign: "center",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
            color: "#f87171",
          }}
        >
          <AlertCircle size={26} />
        </div>

        <h3 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Admin Console Error
        </h3>

        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            lineHeight: 1.6,
            marginBottom: "1.75rem",
          }}
        >
          A temporary issue occurred while rendering the administration interface. You can attempt to refresh this view or return to the main dashboard.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button
            onClick={() => reset()}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <RotateCcw size={16} />
            <span>Try Again</span>
          </button>
          <button
            onClick={() => (window.location.href = "/admin")}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
