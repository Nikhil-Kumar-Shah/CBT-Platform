"use client";

import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  blade?: boolean;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  blade = false,
  hoverable = true,
  className = "",
  style,
  ...props
}) => {
  return (
    <div
      className={`card ${blade ? "card-blade" : ""} ${className}`}
      style={{
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  blade?: boolean;
  accentColor?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  badge,
  blade = false,
  accentColor,
  onClick,
  style,
}) => {
  return (
    <div
      className={`card ${blade ? "card-blade" : ""}`}
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "130px",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <span className="text-label" style={{ color: "var(--text-muted)" }}>
          {title}
        </span>
        {icon && (
          <div
            style={{
              padding: "0.45rem",
              borderRadius: "var(--radius-md)",
              background: accentColor ? `${accentColor}18` : "var(--bg-surface-elevated)",
              color: accentColor || "var(--primary-500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--text-main)", letterSpacing: "-0.02em" }}>
            {value}
          </span>
          {badge}
        </div>
        {subtitle && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
