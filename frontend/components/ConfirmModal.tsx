"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, AlertCircle, HelpCircle, X } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    confirmBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const config = {
    danger: {
      icon: <AlertCircle size={24} style={{ color: "#f87171" }} />,
      confirmBg: "#dc2626",
      confirmHover: "#b91c1c",
      confirmBorder: "rgba(239, 68, 68, 0.4)",
    },
    warning: {
      icon: <AlertTriangle size={24} style={{ color: "#fbbf24" }} />,
      confirmBg: "#d97706",
      confirmHover: "#b45309",
      confirmBorder: "rgba(245, 158, 11, 0.4)",
    },
    primary: {
      icon: <HelpCircle size={24} style={{ color: "#818cf8" }} />,
      confirmBg: "#4f46e5",
      confirmHover: "#4338ca",
      confirmBorder: "rgba(99, 102, 241, 0.4)",
    },
  }[variant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#111827",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "1.75rem",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
          color: "#ffffff",
          animation: "modalZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem" }}>
          <div
            style={{
              padding: "0.6rem",
              borderRadius: "12px",
              background: "rgba(255, 255, 255, 0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h3
              id="confirm-modal-title"
              style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "#f8fafc" }}
            >
              {title}
            </h3>
            <p style={{ fontSize: "0.92rem", color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            aria-label="Close dialog"
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              cursor: loading ? "not-allowed" : "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              borderRadius: "6px",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "0.6rem 1.1rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "8px",
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#e2e8f0",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = "#334155";
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = "#1e293b";
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "0.6rem 1.25rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "8px",
              background: config.confirmBg,
              border: `1px solid ${config.confirmBorder}`,
              color: "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              transition: "background 0.15s ease",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = config.confirmHover;
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = config.confirmBg;
            }}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
