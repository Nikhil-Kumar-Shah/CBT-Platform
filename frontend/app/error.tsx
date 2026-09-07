"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root application error caught:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "radial-gradient(ellipse at top, #1e1b4b 0%, #090d16 70%)",
        color: "#ffffff",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "2.5rem",
          textAlign: "center",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          background: "#0f172a",
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

        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Unexpected Application Error
        </h2>

        <p
          style={{
            color: "#94a3b8",
            fontSize: "0.925rem",
            lineHeight: 1.6,
            marginBottom: "2rem",
          }}
        >
          An unexpected error occurred while processing this page. The issue has been logged, and your examination data remains safe on the server.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button
            onClick={() => reset()}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <RotateCcw size={16} />
            <span>Reload View</span>
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Home size={16} />
            <span>Home</span>
          </button>
        </div>
      </div>
    </div>
  );
}
