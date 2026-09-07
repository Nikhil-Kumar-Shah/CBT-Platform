"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  showHomeButton?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    if (
      typeof window !== "undefined" &&
      (error?.name === "ChunkLoadError" ||
        error?.message?.includes("Loading chunk") ||
        error?.message?.includes("Refused to execute script") ||
        error?.message?.includes("Minified React error #423"))
    ) {
      const lastReload = sessionStorage.getItem("cbt_chunk_reload_ts");
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem("cbt_chunk_reload_ts", String(now));
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    if (
      typeof window !== "undefined" &&
      (this.state.error?.name === "ChunkLoadError" ||
        this.state.error?.message?.includes("Loading chunk") ||
        this.state.error?.message?.includes("Refused to execute script"))
    ) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "360px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            width: "100%",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "520px",
              width: "100%",
              padding: "2rem",
              textAlign: "center",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              background: "rgba(15, 23, 42, 0.95)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
                color: "#ef4444",
              }}
            >
              <AlertTriangle size={26} />
            </div>

            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              {this.props.fallbackTitle || "Something went wrong"}
            </h3>

            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              {this.props.fallbackMessage ||
                "A temporary application error occurred while displaying this section. Your progress and data remain secure."}
            </p>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button onClick={this.handleReset} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <RotateCcw size={16} />
                <span>Try Again</span>
              </button>

              {this.props.showHomeButton !== false && (
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = window.location.pathname.startsWith("/admin") ? "/admin" : "/exam";
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <Home size={16} />
                  <span>Return to Portal</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
