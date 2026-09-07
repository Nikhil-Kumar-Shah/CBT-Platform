"use client";

import React from "react";
import { AlertCircle, CheckCircle2, AlertTriangle, Info, Loader2 } from "lucide-react";

export type AlertVariant = "danger" | "warning" | "success" | "info";

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  children,
  icon,
  style,
  className = "",
}) => {
  let bg = "var(--info-bg)";
  let border = "var(--info-border)";
  let color = "var(--info)";
  let DefaultIcon = Info;

  if (variant === "danger") {
    bg = "var(--danger-bg)";
    border = "var(--danger-border)";
    color = "var(--danger)";
    DefaultIcon = AlertCircle;
  } else if (variant === "warning") {
    bg = "var(--warning-bg)";
    border = "var(--warning-border)";
    color = "var(--warning)";
    DefaultIcon = AlertTriangle;
  } else if (variant === "success") {
    bg = "var(--success-bg)";
    border = "var(--success-border)";
    color = "var(--success)";
    DefaultIcon = CheckCircle2;
  }

  return (
    <div
      className={className}
      style={{
        padding: "1rem 1.25rem",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: "var(--radius-md)",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        ...style,
      }}
    >
      <div style={{ color, marginTop: "0.1rem", flexShrink: 0 }}>
        {icon || <DefaultIcon size={18} />}
      </div>
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color, marginBottom: "0.2rem" }}>
            {title}
          </div>
        )}
        <div style={{ fontSize: "0.85rem", color: "var(--text-main)", lineHeight: 1.45 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  style,
}) => {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "3.5rem 1.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "var(--radius-xl)",
            background: "var(--bg-surface-elevated)",
            color: "var(--text-subtle)",
            marginBottom: "1rem",
            display: "inline-flex",
          }}
        >
          {icon}
        </div>
      )}
      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: "0.35rem", maxWidth: "420px" }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: "1.25rem" }}>{action}</div>}
    </div>
  );
};

export interface LoadingStateProps {
  message?: string;
  style?: React.CSSProperties;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading...",
  style,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3.5rem 1.5rem",
        gap: "0.85rem",
        ...style,
      }}
    >
      <Loader2 size={32} style={{ color: "var(--primary-500)", animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: "0.88rem", color: "var(--text-muted)", fontWeight: 500 }}>
        {message}
      </span>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes spin { to { transform: rotate(360deg); } }`,
        }}
      />
    </div>
  );
};
