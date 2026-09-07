"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({
  message,
  type = "info",
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const config = {
    success: {
      icon: <CheckCircle2 size={18} style={{ color: "#34d399", flexShrink: 0 }} />,
      bg: "rgba(16, 185, 129, 0.12)",
      border: "rgba(16, 185, 129, 0.3)",
      color: "#ecfdf5",
    },
    error: {
      icon: <AlertCircle size={18} style={{ color: "#f87171", flexShrink: 0 }} />,
      bg: "rgba(239, 68, 68, 0.15)",
      border: "rgba(239, 68, 68, 0.35)",
      color: "#fef2f2",
    },
    warning: {
      icon: <AlertTriangle size={18} style={{ color: "#fbbf24", flexShrink: 0 }} />,
      bg: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.35)",
      color: "#fffbeb",
    },
    info: {
      icon: <Info size={18} style={{ color: "#818cf8", flexShrink: 0 }} />,
      bg: "rgba(99, 102, 241, 0.15)",
      border: "rgba(99, 102, 241, 0.35)",
      color: "#eef2ff",
    },
  }[type];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.85rem 1.25rem",
        background: config.bg,
        backgroundColor: "#0d131f",
        border: `1px solid ${config.border}`,
        borderRadius: "12px",
        color: config.color,
        fontSize: "0.92rem",
        fontWeight: 500,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(12px)",
        maxWidth: "420px",
        animation: "toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {config.icon}
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.6)",
          cursor: "pointer",
          padding: "2px",
          display: "flex",
          alignItems: "center",
          borderRadius: "4px",
          transition: "color 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)")}
      >
        <X size={16} />
      </button>
    </div>
  );
}
