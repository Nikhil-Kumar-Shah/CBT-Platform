"use client";

import React from "react";

export type BadgeVariant =
  | "live"
  | "scheduled"
  | "draft"
  | "completed"
  | "operational"
  | "degraded"
  | "offline"
  | "primary"
  | "ember"
  | "neutral"
  | "warning"
  | "danger"
  | "info";

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  dot = false,
  children,
  style,
  className = "",
}) => {
  let badgeClass = `badge badge-${variant}`;

  let dotColor = "var(--text-subtle)";
  if (variant === "live" || variant === "operational") dotColor = "#10b981";
  else if (variant === "scheduled" || variant === "degraded" || variant === "warning") dotColor = "#f59e0b";
  else if (variant === "offline" || variant === "danger") dotColor = "#ef4444";
  else if (variant === "ember") dotColor = "var(--ember-500)";
  else if (variant === "primary" || variant === "completed") dotColor = "var(--primary-400)";

  return (
    <span className={`${badgeClass} ${className}`} style={{ ...style }}>
      {dot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};

export interface StatusIndicatorProps {
  status: "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "UNKNOWN" | string;
  label?: string;
  size?: number;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, size = 8 }) => {
  const norm = status.toUpperCase();
  let color = "var(--text-subtle)";
  let defaultLabel = "Unknown";

  if (norm === "OPERATIONAL" || norm === "ONLINE" || norm === "CONNECTED" || norm === "OK") {
    color = "#10b981";
    defaultLabel = "Operational";
  } else if (norm === "DEGRADED" || norm === "WARNING") {
    color = "#f59e0b";
    defaultLabel = "Degraded";
  } else if (norm === "OFFLINE" || norm === "DISCONNECTED" || norm === "CRITICAL") {
    color = "#ef4444";
    defaultLabel = "Offline";
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
      <span
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}80`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-main)" }}>
        {label || defaultLabel}
      </span>
    </div>
  );
};
